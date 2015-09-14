/*
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Contains unit tests for the NexeModuleLoader service.
 */
'use strict';

goog.setTestOnly();

goog.require('safelight.NexeModule');
goog.require('safelight.NexeModuleLoader');
goog.require('safelight.nexeModuleLoader.module');

describe('safelight.NexeModuleLoader', function() {
  var nexeModuleLoader, $rootScope, $timeout;

  beforeEach(function() {
    module(safelight.nexeModuleLoader.module.name);
    inject(function(_nexeModuleLoader_, _$rootScope_, _$timeout_) {
      nexeModuleLoader = _nexeModuleLoader_;
      $rootScope = _$rootScope_;
      $timeout = _$timeout_;
    });
  });

  it('should fail due to no-nacl', function() {
    expect(angular.isFunction(nexeModuleLoader.load)).toBe(true);

    var nexeModule = nexeModuleLoader.load('/foo.nmf');
    expect(nexeModule).not.toBeNull();

    var successVal, failureVal;
    nexeModule.request().then(
        function(m) { successVal = m; },
        function(m) { failureVal = m; });
    $timeout.flush();

    expect(successVal).toBeUndefined();
    expect(failureVal).toEqual({failure: 'Load failed', log: ''});
  });
});

