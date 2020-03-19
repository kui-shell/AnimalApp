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

import { Tab, CommandLine, registerTabCompletionEnumerator, TabCompletionSpec } from '@kui-shell/core'
import { getCommandFromArgs } from './util/util'

/**
 * Invoke an enumeration command and return the filtered list of matching strings
 *
 */
async function getMatchingStrings(tab: Tab, cmd: string, spec: TabCompletionSpec): Promise<string[]> {
  const completions: string = await tab.REPL.qexec(cmd, undefined, undefined, { raw: true })
  const list: string[] = completions.split(/[\n\r]/).map(_ => _.replace(/^\w+\//, ''))

  return list.filter(name => name.startsWith(spec.toBeCompleted))
}

/**
 * Strip off the ParsedOptions in a way that lets us make an enumeration query safely
 *
 */
function optionals(commandLine: CommandLine, filter: (key: string) => boolean = () => true) {
  const options = commandLine.parsedOptions

  return Object.keys(options)
    .filter(filter)
    .filter(_ => !/^(-o|--output)/.test(_)) // remove any existing -o, because we want to use -o name
    .map(key => `${key.length === 1 ? `-${key}` : `--${key}`} ${options[key]}`)
    .join(' ')
}

/**
 * Tab completion of kube resource names
 *
 */
async function completeResourceNames(tab: Tab, commandLine: CommandLine, spec: TabCompletionSpec): Promise<string[]> {
  const { argvNoOptions, argv, parsedOptions } = commandLine
  const command = getCommandFromArgs({ argvNoOptions })

  // index of the arg just before the one to be completed
  const previous = spec.toBeCompletedIdx === -1 ? commandLine.argv.length - 1 : spec.toBeCompletedIdx - 1
  if (previous > 0 && (argv[previous] === '-n' || argv[previous] === '--namespace')) {
    //
    // then we are being asked to complete a namespace
    //
    const cmd = `${command} get ns ${optionals(commandLine, _ => _ !== '-n' && _ !== '--namespace')} -o name`
    return getMatchingStrings(tab, cmd, spec)
  } else if (
    (argvNoOptions[0] === 'kubectl' || argvNoOptions[0] === 'k' || argvNoOptions[0] === 'oc') &&
    (argvNoOptions[1] === 'get' ||
      argvNoOptions[1] === 'describe' ||
      argvNoOptions[1] === 'annotate' ||
      argvNoOptions[1] === 'label' ||
      (argvNoOptions[1] === 'delete' && !parsedOptions.f && !parsedOptions.file))
  ) {
    //
    // then we are being asked to complete a resource name
    //
    const entityType = argvNoOptions[2]

    const cmd = `${command} get ${entityType} ${optionals(commandLine)} -o name`
    return getMatchingStrings(tab, cmd, spec)
  }
}

/**
 * Entry point to register kubernetes tab completion
 *
 */
export default () => {
  registerTabCompletionEnumerator(completeResourceNames)
}
