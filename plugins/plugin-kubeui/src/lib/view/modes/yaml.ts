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

import { ModeRegistration } from '@kui-shell/core/api/registrars'

import { KubeResource, isKubeResource } from '../../model/resource'

/**
 * The YAML mode applies to all KubeResources, and simply extracts the
 * raw `data` field from the resource; note how we indicate that this
 * raw data has a yaml content type.
 *
 */
const yamlMode: ModeRegistration<KubeResource> = {
  when: isKubeResource,
  mode: {
    mode: 'raw',
    label: 'YAML',

    content: (_, resource: KubeResource) => ({
      content: resource.data,
      contentType: 'yaml'
    }),

    // traits:
    order: 999 // we want this to be placed as the last tab
  }
}

export default yamlMode
