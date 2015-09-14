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
 * @fileoverview Contains unit tests for the alerter service.
 */
'use strict';

goog.setTestOnly();

goog.require('safelight.alerter.module');

describe('safelight.Alerter', function() {
  var alerter;

  beforeEach(function() {
    module(safelight.alerter.module.name);
    inject(function(_alerter_) {
      alerter = _alerter_;
    });
  });

  it('should have the right functions', function() {
    expect(angular.isFunction(alerter.warning)).toBe(true);
    expect(angular.isFunction(alerter.error)).toBe(true);
    expect(angular.isFunction(alerter.dismiss)).toBe(true);
    expect(angular.isFunction(alerter.dismissAll)).toBe(true);
  });

  it('should progress properly', function() {
    expect(alerter.alerts.length).toBe(0);
    alerter.warning('warn');
    expect(alerter.alerts.length).toBe(1);
    alerter.error('err');
    expect(alerter.alerts.length).toBe(2);
    alerter.dismiss(0);
    expect(alerter.alerts.length).toBe(1);
    alerter.dismissAll();
    expect(alerter.alerts.length).toBe(0);
  });
});
