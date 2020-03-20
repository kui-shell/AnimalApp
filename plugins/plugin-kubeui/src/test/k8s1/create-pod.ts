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

import { Common, CLI, ReplExpect, SidecarExpect, Selectors } from '@kui-shell/test'
import {
  waitForGreen,
  waitForRed,
  defaultModeForGet,
  createNS,
  allocateNS,
  deleteNS
} from '@kui-shell/plugin-kubeui/tests/lib/k8s/utils'

import { dirname } from 'path'
const ROOT = dirname(require.resolve('@kui-shell/plugin-kubeui/tests/package.json'))

const commands = ['kubectl']
if (process.env.NEEDS_OC) {
  commands.push('oc')
}
const dashFs = ['-f', '--filename']

commands.forEach(command => {
  describe(`${command} create pod ${process.env.MOCHA_RUN_TARGET || ''}`, function(this: Common.ISuite) {
    before(Common.before(this))
    after(Common.after(this))

    dashFs.forEach(dashF => {
      const ns: string = createNS()
      const inNamespace = `-n ${ns}`

      allocateNS(this, ns, command)

      it(`should create sample pod from URL via ${command}`, async () => {
        try {
          const selector = await CLI.command(
            `${command} create ${dashF} https://raw.githubusercontent.com/kubernetes/examples/master/staging/pod ${inNamespace}`,
            this.app
          ).then(ReplExpect.okWithCustom({ selector: Selectors.BY_NAME('nginx') }))

          // wait for the badge to become green
          await waitForGreen(this.app, selector)

          // now click on the table row
          await this.app.client.click(`${selector} .clickable`)
          await SidecarExpect.open(this.app)
            .then(SidecarExpect.mode(defaultModeForGet))
            .then(SidecarExpect.showing('nginx'))
        } catch (err) {
          await Common.oops(this, true)(err)
        }
      })

      it(`should delete the sample pod from URL via ${command}`, () => {
        return CLI.command(
          `${command} delete ${dashF} https://raw.githubusercontent.com/kubernetes/examples/master/staging/pod ${inNamespace}`,
          this.app
        )
          .then(ReplExpect.okWithCustom({ selector: Selectors.BY_NAME('nginx') }))
          .then(selector => waitForRed(this.app, selector))
          .catch(Common.oops(this))
      })

      it(`should create sample pod from local file via ${command}`, () => {
        return CLI.command(`${command} create ${dashF} "${ROOT}/data/k8s/headless/pod.yaml" ${inNamespace}`, this.app)
          .then(ReplExpect.okWithCustom({ selector: Selectors.BY_NAME('nginx') }))
          .then(selector => waitForGreen(this.app, selector))
          .catch(Common.oops(this))
      })

      it(`should delete the sample pod by name via ${command}`, () => {
        return CLI.command(`${command} delete pod nginx ${inNamespace}`, this.app)
          .then(ReplExpect.okWithCustom({ selector: Selectors.BY_NAME('nginx') }))
          .then(selector => waitForRed(this.app, selector))
          .catch(Common.oops(this))
      })

      deleteNS(this, ns, command)
    })
  })
})
