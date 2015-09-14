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

'use strict';
goog.provide('safelight.timingPanelDirective');

goog.require('safelight.HtmlPanelController');


/**
 * Directive for connecting a text-panel directive to monitor
 * the active filter's timing output.
 *
 * @ngInject
 * @return {!angular.Directive}
 */
safelight.timingPanelDirective = function() {
  return {
    replace: true,
    restrict: 'E',
    templateUrl: '/components/timing_panel/timing_panel_directive.html',
    controller: safelight.TimingPanelController,
    controllerAs: 'timingPanelCtrl',
  };
};
