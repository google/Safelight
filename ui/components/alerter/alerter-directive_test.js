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
 * @fileoverview Contains unit tests for the alerter directive.
 */
'use strict';

goog.setTestOnly();

goog.require('safelight.alerter.module');
goog.require('safelight.templates.module');

describe('safelight.alerterDirective', function() {
  var element, scope, alerterCtrl;

  beforeEach(function() {
    angular.module(safelight.templates.module.name)
        .value('forceCachedTemplates', true);
    module(safelight.alerter.module.name);
    module(safelight.templates.module.name);
    inject(function($compile, $rootScope) {
      scope = $rootScope.$new();
      var template = '<alerter></alerter>';
      element = $compile(template)(scope);
      scope.$apply();
      alerterCtrl = element.controller('alerter');
    });
  });

  it('should add and remove alerts', function() {
    alerterCtrl.alerter.error('err');
    alerterCtrl.alerter.warning('warn');
    scope.$digest(); // Force model change propagation.

    var alerts = element.children();
    expect(alerts.length).toBe(2);
    expect(alerts.eq(0).children().eq(0).html().trim()).toBe('err');
    expect(alerts.eq(1).children().eq(0).html().trim()).toBe('warn');

    alerterCtrl.alerter.dismissAll();
    scope.$digest(); // Force model change propagation.

    alerts = element.children();
    expect(alerts.length).toBe(0);
  });
});
