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

import Debug from 'debug'

import Commands from '@kui-shell/core/api/commands'
import { i18n } from '@kui-shell/core/api/i18n'
import { Tab } from '@kui-shell/core/api/ui-lite'
import { ModeRegistration } from '@kui-shell/core/api/registrars'

import { KubeResource } from '../../model/resource'

const strings = i18n('plugin-kubeui')
const debug = Debug('k8s/view/modes/last-applied')

/**
 * Extract the last-applied-configuration annotation
 *
 */
function getLastAppliedRaw(resource: KubeResource): string {
  // kube stores the last applied configuration (if any) in a raw json string
  return (
    resource.metadata.annotations && resource.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration']
  )
}

/**
 * @return whether the given resource has a last applied configuration annotation
 *
 */
function hasLastApplied(resource: KubeResource): boolean {
  return getLastAppliedRaw(resource) !== undefined
}

/**
 * Respond to REPL
 *
 * @param lastRaw the last applied configuration, unparsed
 */
async function respondWith(lastRaw: string, fullResource: KubeResource): Promise<Commands.CustomResponse> {
  const { safeDump } = await import('js-yaml')

  // oof, it comes in as a JSON string, but we want a YAML string
  const resource: KubeResource = JSON.parse(lastRaw) // we will extract some parameters from this
  const content = safeDump(resource) // this is what we want to show up in the UI

  // add a startTime (after serializing the content, which is what
  // will be displayed in the editor body), so that the sidecar
  // renders with a toolbar text
  if (!resource.metadata.creationTimestamp) {
    resource.metadata.creationTimestamp = fullResource.metadata.creationTimestamp
  }

  return {
    type: 'custom',
    isEntity: true,
    name: resource.metadata.name,
    contentType: 'yaml',
    content,
    resource
  }
}

const renderLastApplied = async (tab: Tab, resource: KubeResource) => {
  debug('renderAndViewLastApplied', resource)

  return respondWith(getLastAppliedRaw(resource), resource)
}

/**
 * Add a Pods mode button to the given modes model, if called for by
 * the given resource.
 *
 */
export const lastAppliedMode: ModeRegistration<KubeResource> = {
  when: hasLastApplied,
  mode: {
    mode: 'last applied',
    label: strings('lastApplied'),
    content: renderLastApplied
  }
}
