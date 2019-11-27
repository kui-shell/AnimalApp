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

import { Arguments, Registrar } from '@kui-shell/core/api/commands'
import { MultiModalResponse } from '@kui-shell/core/api/ui-lite'
import { doExecRaw } from '@kui-shell/plugin-kubeui'

import apiVersion from './apiVersion'
import commandPrefix from '../command-prefix'
import { HelmRelease } from '../../models/release'

async function doGet({ command, argvNoOptions }: Arguments): Promise<string | MultiModalResponse<HelmRelease>> {
  const projIdx = argvNoOptions.indexOf('get') + 1
  const releaseIdx = argvNoOptions.length - 1
  const projection = projIdx < releaseIdx ? argvNoOptions[projIdx] : undefined
  const releaseName = argvNoOptions[releaseIdx]

  const basic = /REVISION:\s+(\S+)[\n\r]+RELEASED:\s+([^\n\r]+)[\n\r]+CHART:\s+(\S+)/
  const response = await doExecRaw(command)

  if (projection) {
    return response
  }

  const match = response.match(basic)
  const revision = match[1]
  const creationTimestamp = match[2]
  const chart = match[3]

  const endOfBasicSection = Math.min(response.indexOf('USER-SUPPLIED VALUES'), response.indexOf('COMPUTED VALUES'))

  return {
    apiVersion,
    kind: 'HelmRelease',
    metadata: {
      name: releaseName,
      generation: revision,
      creationTimestamp
    },
    prettyName: chart,
    summary: {
      content: response.substring(0, endOfBasicSection).trim(),
      contentType: 'yaml'
    },
    isSimulacrum: true,
    originatingCommand: command,
    data: response,
    modes: []
  }
}

export default (registrar: Registrar) => {
  registrar.listen(`/${commandPrefix}/helm/get`, doGet, {
    inBrowserOk: true
  })
}
