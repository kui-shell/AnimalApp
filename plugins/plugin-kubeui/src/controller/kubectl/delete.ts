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

import flags from './flags'
import { KubeOptions } from './options'
import { doExecWithStatus } from './exec'
import commandPrefix from '../command-prefix'

import { FinalState } from '../../lib/model/states'

/**
 * Prepare the command line for delete: by default, apparently,
 * kubernetes treats finalizers as synchronous, and --wait defaults to
 * true
 *
 */
function prepareArgsForDelete(args: Arguments<KubeOptions>) {
  if (!Object.prototype.hasOwnProperty.call(args.parsedOptions, 'wait')) {
    return args.command + ' --wait=false'
  } else {
    return args.command
  }
}

export default (registrar: Registrar) => {
  const doDelete = doExecWithStatus('delete', FinalState.OfflineLike, prepareArgsForDelete)

  registrar.listen(`/${commandPrefix}/kubectl/delete`, doDelete, flags)
  registrar.listen(`/${commandPrefix}/k/delete`, doDelete, flags)
}
