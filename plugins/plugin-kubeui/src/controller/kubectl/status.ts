/*
 * Copyright 2018-19 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import Debug from 'debug'
import { join } from 'path'

import { isHeadless } from '@kui-shell/core/api/capabilities'
import { Arguments, ExecOptions, Registrar } from '@kui-shell/core/api/commands'
import { CodedError } from '@kui-shell/core/api/errors'
import Tables from '@kui-shell/core/api/tables'
import Util from '@kui-shell/core/api/util'

import { flags } from './flags'
import Options from './options'
import commandPrefix from '../command-prefix'

import { withOkOn404, withRetryOn404 } from '../../lib/util/retry'
import { isDirectory } from '../../lib/util/util'
import { KubeItems, KubeResource } from '../../lib/model/resource'
import { States, FinalState } from '../../lib/model/states'
import { formatEntity } from '../../lib/view/formatEntity'

const debug = Debug('k8s/controller/status')

/** administartive core controllers that we want to ignore */
// const adminCoreFilter = '-l provider!=kubernetes'

/** administrative CRDs that we want to ignore */
// const adminCRDFilter = '-l app!=mixer,app!=istio-pilot,app!=ibmcloud-image-enforcement,app!=ibm-cert-manager'

const usage = (command: string) => ({
  command,
  strict: command,
  docs: 'Check the deployment status of a set of resources',
  onlyEnforceOptions: true,
  optional: [
    {
      name: 'file|kind',
      file: true,
      positional: true,
      docs: 'A kubernetes resource file or kind'
    },
    {
      name: 'resourceName',
      positional: true,
      docs: 'The name of a kubernetes resource of the given kind'
    },
    { name: '--final-state', hidden: true }, // when do we stop polling for status updates?
    { name: '--namespace', alias: '-n', docs: 'Inspect a specified namespace' },
    { name: '--all', alias: '-a', docs: 'Show status across all namespaces' },
    {
      name: '--multi',
      alias: '-m',
      docs: 'Display multi-cluster views as a multiple tables'
    },
    {
      name: '--response',
      docs: 'The initial response from the CRUD command'
    },
    {
      name: '--watching',
      hidden: true,
      boolean: true,
      docs: 'internal use: called as part of the polling loop'
    },
    {
      name: '--watch',
      alias: '-w',
      boolean: true,
      docs: 'After listing/getting the requested object, watch for changes'
    }
  ],
  example: `kubectl ${command} @seed/cloud-functions/function/echo.yaml`
})

/**
 * Make a Tables.Row model for the status table
 *
 */
const headerRow = (kind: string): Tables.Row => {
  debug('headerRow', kind)

  const kindAttr = [{ value: 'KIND', outerCSS: 'header-cell not-too-wide entity-kind' }]
  const namespaceAttr =
    kind && kind.match(/(ns|Namespace)/i)
      ? []
      : [
          {
            value: 'NAMESPACE',
            outerCSS: 'header-cell pretty-narrow hide-with-sidecar'
          }
        ]
  // const contextAttr = !opts.context ? [] : formatContextAttr('CONTEXT', 'header-cell')
  const statusAttr = [
    { value: 'STATUS', outerCSS: 'header-cell badge-width' },
    {
      value: 'MESSAGE',
      outerCSS: 'header-cell not-too-wide hide-with-sidecar min-width-date-like'
    }
  ]

  const attributes = kindAttr
    // .concat(contextAttr)
    .concat(namespaceAttr)
    .concat(statusAttr)

  return {
    type: 'status',
    name: 'NAME',
    outerCSS: 'header-cell',
    attributes
  }
}

/**
 * In case of an error fetching the status of an entity, return something...
 *
 */
const errorEntity = (execOptions: ExecOptions.ExecOptions, base: KubeResource, backupNamespace?: string) => (
  err: CodedError
) => {
  debug('creating error entity', err.code, base, backupNamespace, err)

  if (!base) {
    base = {
      apiVersion: undefined,
      kind: undefined,
      originatingCommand: base.originatingCommand,
      metadata: { name: undefined, namespace: backupNamespace }
    }
  } else if (!base.metadata) {
    base.metadata = { name: undefined, namespace: backupNamespace }
  } else if (!base.metadata.namespace) {
    base.metadata.namespace = backupNamespace
  }

  if (err.code === 404) {
    return Object.assign({}, base, {
      status: {
        state: States.Offline,
        message: 'resource has been deleted'
      }
    })
  } else {
    if (execOptions.raw) {
      throw err
    } else {
      return Object.assign({}, base, {
        status: {
          state: States.Failed,
          message: 'error fetching resource'
        }
      })
    }
  }
}

/**
 * Get the status of those entities referenced directly, either:
 *
 *   1. across all entities across all contexts
 *   2. across all entities in the current context
 *   3. of a given kind,name
 *   4. across files in a given directory
 *   5. in a given file (local or remote)
 *
 */
interface FinalStateOptions extends Options {
  response?: string
  watching?: boolean
  'final-state'?: FinalState
}
const getDirectReferences = (command: string) => async ({
  execOptions,
  argvNoOptions,
  parsedOptions,
  REPL
}: Arguments<FinalStateOptions>): Promise<{
  kind: string
  resource: Promise<void | KubeResource | KubeResource[]>
}> => {
  const raw = Object.assign({}, execOptions, { raw: true })

  const idx = argvNoOptions.indexOf(command) + 1
  const file = argvNoOptions[idx]
  const name = argvNoOptions[idx + 1]
  const namespace = parsedOptions.namespace || parsedOptions.n || 'default'
  const finalState: FinalState = parsedOptions['final-state'] || FinalState.NotPendingLike
  // debug('getDirectReferences', file, name)

  /** format a --namespace cli option for the given kubeEntity */
  const ns = ({ metadata = {} } = {}) => {
    debug('ns', metadata['namespace'], namespace)
    return metadata['namespace']
      ? `-n "${metadata['namespace']}"`
      : parsedOptions.namespace || parsedOptions.n
      ? `-n ${namespace}`
      : ''
  }

  const { safeLoadAll: parseYAML } = await import('js-yaml')

  if (file.charAt(0) === '!') {
    const resources: KubeResource[] = parseYAML(execOptions.parameters[file.slice(1)])
    debug('status by programmatic parameter', resources)
    return {
      kind: 'file',
      resource: Promise.all(
        resources.map(async _ => {
          return REPL.qexec<KubeResource>(
            `kubectl get "${_.kind}" "${_.metadata.name}" ${ns(_)} -o json`,
            undefined,
            undefined,
            raw
          )
        })
      )
    }
  } else if (name) {
    //
    // then the user has asked for the status of a named resource
    //
    const kind = file
    const command = `kubectl get "${kind}" "${name || ''}" ${ns()} -o json`
    debug('status by kind and name', command)

    // note: don't retry the getter on 404 if we're expecting the
    // element (eventually) not to exist
    const getter = async (): Promise<KubeResource> => {
      return REPL.qexec<KubeResource>(command, undefined, undefined, Object.assign({}, execOptions, { raw: true }))
    }

    const kubeEntity = await (!finalState || finalState === FinalState.OfflineLike
      ? withOkOn404(getter, command)
      : withRetryOn404(getter, command))

    if (!kubeEntity) {
      return { kind, resource: Promise.resolve() }
    } else {
      return { kind, resource: Promise.resolve(kubeEntity) }
    }
  } else {
    const filepath = Util.findFile(file)
    const isURL = file.match(/^http[s]?:\/\//)
    const isDir = isURL ? false : await isDirectory(filepath)

    debug('status by filepath', file, filepath, isURL, isDir)

    if (isDir) {
      // this is a directory of yamls
      debug('status of directory')

      // why the dynamic import? being browser friendly here
      const { readdir } = await import('fs-extra')

      const files: string[] = await readdir(filepath)
      const yamls = files.filter(_ => _.match(/^[^\\.#].*\.yaml$/)).map(file => join(filepath, file))

      if (files.find(file => file === 'seeds')) {
        const seedsDir = join(filepath, 'seeds')
        if (await isDirectory(seedsDir)) {
          const seeds: string[] = (await readdir(seedsDir)).filter(_ => _.match(/\.yaml$/))
          seeds.forEach(file => yamls.push(join(filepath, 'seeds', file)))
        }
      }

      const main = yamls.find(_ => _.match(/main.yaml$/))
      const yamlsWithMainFirst = (main ? [main] : []).concat(yamls.filter(_ => !_.match(/main.yaml$/)))

      // make a list of tables, recursively calling ourselves for
      // each yaml file in the given directory
      return {
        kind: 'dir',
        resource: Promise.all(
          yamlsWithMainFirst.map(async filepath => {
            return REPL.qexec<KubeResource>(
              `k status "${filepath}" --final-state ${finalState}`,
              undefined,
              undefined,
              execOptions
            )
          })
        )
      }
    } else if (isDir === undefined) {
      // then the file does not exist; maybe the user specified a resource kind, e.g. k status pods
      debug('status by resource kind', file, name)

      const kubeEntities = REPL.qexec<KubeItems>(
        `kubectl get "${file}" "${name || ''}" ${ns()} -o json`,
        undefined,
        undefined,
        raw
      )
        .then(_ => _.items)
        .catch(err => {
          if (err.code === 404) {
            // then no such resource type exists
            throw err
          } else {
            return errorEntity(execOptions, undefined, namespace)(err)
          }
        })

      return { kind: file, resource: kubeEntities }
    } else {
      // then the user has pointed us to a yaml file
      debug('status by file', file)

      // handle !spec
      const passedAsParameter = !isURL && filepath.match(/\/(!.*$)/)

      const specs: KubeResource[] = (passedAsParameter
        ? parseYAML(execOptions.parameters[passedAsParameter[1].slice(1)]) // yaml given programatically
        : Util.flatten((await REPL.qexec<string[]>(`_fetchfile ${REPL.encodeComponent(file)}`)).map(_ => parseYAML(_)))
      ).filter(_ => _) // in case there are empty paragraphs;
      // debug('specs', specs)

      const kubeEntities = Promise.all(
        specs.map(async spec => {
          return REPL.qexec<KubeResource>(
            `kubectl get "${spec.kind}" "${spec.metadata.name}" ${ns(spec)} -o json`,
            undefined,
            undefined,
            raw
          ).catch(errorEntity(execOptions, spec, namespace))
        })
      )

      return { kind: undefined, resource: kubeEntities }
    }
  }
}

/**
 * k status command handler
 *
 */
export const status = (command: string) => async (
  args: Arguments<FinalStateOptions>
): Promise<true | string | KubeResource | Tables.Table> => {
  const { kind, resource } = await getDirectReferences(command)(args)
  const direct = await resource
  // debug('getDirectReferences', direct)

  if (args.execOptions.raw && !Array.isArray(direct)) {
    if (!direct) {
      return undefined
    } else {
      return direct
    }
  }

  if (!direct && args.parsedOptions['final-state'] === FinalState.OfflineLike) {
    if (args.parsedOptions.watching) {
      // this is part of the watching loop
      const error: CodedError = new Error(args.parsedOptions.response || '')
      error.code = 404
      throw error
    } else {
      return args.parsedOptions.response || true
    }
  }

  const body = Array.isArray(direct)
    ? await Promise.all(direct.map(formatEntity(args.parsedOptions)))
    : [await formatEntity(args.parsedOptions)(direct)]

  const table = new Tables.Table({
    body,
    header: headerRow(kind),
    noSort: true
  })

  const doWatch = !isHeadless() && (args.parsedOptions.watch || args.parsedOptions.w)
  if (!doWatch) {
    return table
  } else {
    const refreshCommand = `${args.command.replace('--watch', '').replace('-w', '')} --watching`
    return Tables.formatWatchableTable(table, {
      refreshCommand,
      watchByDefault: true
    })
  }
}

/**
 * Register the commands
 *
 */
export default (registrar: Registrar) => {
  const opts = Object.assign(
    {
      usage: usage('status')
    },
    flags(['watching'])
  )

  registrar.listen(`/${commandPrefix}/status`, status('status'), opts)
  registrar.listen(`/${commandPrefix}/kubectl/status`, status('status'), opts)
  registrar.listen(`/${commandPrefix}/k/status`, status('status'), opts)
}
