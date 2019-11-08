/*
 * Copyright 2018 IBM Corporation
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
const debug = Debug('plugins/kubeui/preload')
debug('loading')

import Capabilities from '@kui-shell/core/api/capabilities'

/**
 * This is the capabilities registraion
 *
 */
export const registerCapability: Capabilities.Registration = async () => {
  if (Capabilities.inBrowser()) {
    debug('register capabilities for browser')
    const { restoreAuth } = await import('./lib/model/auth')
    restoreAuth()
  }
}

/**
 * This is the module
 *
 */
export default async () => {
  if (!Capabilities.isHeadless()) {
    const { registerMode, registerBadge } = await import('@kui-shell/core/api/registrars')
    Promise.all([
      import('./lib/view/modes/crud')
        .then(_ => _.deleteResourceMode)
        .then(registerMode), // summary tab
      import('./lib/view/modes/summary')
        .then(_ => _.default)
        .then(registerMode), // summary tab
      import('./lib/view/modes/yaml')
        .then(_ => _.default)
        .then(registerMode), // yaml tab
      import('./lib/view/modes/pods')
        .then(_ => _.podMode)
        .then(registerMode), // show pods of deployments
      import('./lib/view/modes/events').then(_ => {
        registerMode(_.eventsMode)
        registerBadge(_.eventsBadge)
      }),
      import('./lib/view/modes/containers')
        .then(_ => _.containersMode)
        .then(registerMode), // show containers of pods
      import('./lib/view/modes/last-applied')
        .then(_ => _.default)
        .then(registerMode), // show a last applied configuration tab
      import('./lib/tab-completion')
        .then(_ => _.default())
        .catch((err: Error) => {
          // don't utterly fail if we can't install the tab completion
          // https://github.com/IBM/kui/issues/2793
          debug('error installing kubeui tab-completion extensions', err)
        })
    ])
  }
}

debug('finished loading')
