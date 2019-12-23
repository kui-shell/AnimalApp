/*
 * Copyright 2019 IBM Corporation
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

import { Arguments, Registrar, Table, i18n } from '@kui-shell/core'
import { opts, commandPrefix } from '@kui-shell/plugin-ibmcloud/ks'
import { KubeOptions } from '@kui-shell/plugin-kubeui'

import semver from './semver'
import getRepoURL from './repo/url'
import ListOptions from './list-options'
import getAvailablePlugins from './available'
import getInstalledPlugins from './installed'

const strings = i18n('plugin-ibmcloud/plugin')

/**
 * `ibmcloud plugin ls`
 *
 */
async function doLs(args: Arguments<ListOptions>): Promise<Table> {
  const whichRepo = args.parsedOptions.r || args.parsedOptions.repo
  const repoURL = whichRepo ? await getRepoURL(args, whichRepo) : undefined

  const [{ Plugins: allInstalled }, { plugins: available }] = await Promise.all([
    getInstalledPlugins(args),
    getAvailablePlugins(repoURL)
  ])

  // Notes: the filter reduces allInstalled down to those installed in
  // the specified repo
  const rowData = Object.keys(allInstalled)
    .filter(installedName => available.find(({ name: availableName }) => availableName === installedName))
    .map(key => {
      const { Name: name, Aliases, Version } = allInstalled[key]

      const currentVersion = semver(Version)
      const availableEntry = available.find(_ => _.name === name)
      const latest = availableEntry && availableEntry.versions[availableEntry.versions.length - 1]
      const updateAvailable = latest && latest.version !== currentVersion

      return { name, Aliases, currentVersion, latest, updateAvailable }
    })

  // if no plugins have updates, don't show the LATEST column
  const allPluginsAreUpToDate = rowData.every(_ => !_.updateAvailable)

  const body = rowData.map(_ => ({
    name: _.name,
    onclick: `ibmcloud plugin get ${args.REPL.encodeComponent(_.name)}`,
    onclickSilence: true,
    attributes: [
      { key: strings('ALIASES'), value: _.Aliases ? _.Aliases.join(',') : '', outerCSS: 'hide-with-sidecar' },
      {
        key: strings('STATUS'),
        tag: 'badge',
        value: !_.latest
          ? strings('Unregistered Plugin')
          : _.updateAvailable
          ? strings('Update Available')
          : strings('Ready'),
        css: !_.latest ? 'gray-background' : _.updateAvailable ? 'yellow-background' : 'green-background'
      },
      { key: strings('VERSION'), value: _.currentVersion, outerCSS: '', css: '' }
    ].concat(
      allPluginsAreUpToDate
        ? []
        : [
            {
              key: strings('LATEST'),
              value: _.updateAvailable ? _.latest.version : '',
              outerCSS: 'hide-with-sidecar',
              css: 'yellow-text'
            }
          ]
    )
  }))

  const header = {
    name: 'NAME',
    attributes: body[0].attributes.map(_ => ({ value: _.key, outerCSS: _.outerCSS }))
  }

  return {
    header,
    body
  }
}

/**
 * `ibmcloud ks cluster list`
 *
 */
function doList(args: Arguments<KubeOptions>): Promise<Table> {
  args.command = args.command.replace(/ibmcloud\s+ks\s+clusters?\s+list/, 'ibmcloud ks cluster ls')

  const idx1 = args.argv.indexOf('ibmcloud')
  args.argv[idx1 + 3] = 'ls'

  const idx2 = args.argvNoOptions.indexOf('ibmcloud')
  args.argvNoOptions[idx2 + 3] = 'ls'

  return doLs(args)
}

export default (registrar: Registrar) => {
  const cmd = registrar.listen(`/${commandPrefix}/ibmcloud/plugin/list`, doList, opts)
  registrar.synonym(`/${commandPrefix}/ibmcloud/plugin/ls`, doList, cmd, opts)
}
