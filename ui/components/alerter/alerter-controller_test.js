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
 * @fileoverview Contains unit tests for the alerter controller.
 */
'use strict';

goog.setTestOnly();

goog.require('safelight.AlerterController');
goog.require('safelight.alerter.module');

describe('safelight.AlerterController', function() {
  var alerterCtrl, scope;

  beforeEach(function() {
    module(safelight.alerter.module.name);
    inject(function($controller, $rootScope) {
      scope = $rootScope.$new();
      alerterCtrl = $controller(safelight.AlerterController, {
        $scope: scope
      });
    });
  });

  it('should have alerter member', function() {
    expect(alerterCtrl.alerter).toEqual(jasmine.any(safelight.Alerter));
  });
});
