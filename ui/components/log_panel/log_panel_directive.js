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
goog.provide('safelight.logPanel.module');
goog.provide('safelight.logPanelDirective');

goog.require('safelight.filterManager.module');
goog.require('safelight.textPanel.module');



/**
 * Directive for connecting a text-panel directive to monitor
 * the active filter's log output.
 *
 * @ngInject
 * @param {!safelight.FilterManager} filterManager
 * @return {!angular.Directive}
 */
safelight.logPanelDirective = function(filterManager) {
  return {
    restrict: 'A',
    require: 'textPanel',
    link: function(scope, element, attrs, textPanelCtrl) {
      if (!textPanelCtrl) {
        throw new Error('log-panel can only be applied to text-panel');
      }

      var listenerRemover =
          filterManager.addValuesChangedListener(function(values) {
            if (values.hasOwnProperty('$log')) {
              textPanelCtrl.contents = values['$log'];
            }
          });
      scope.$on('$destroy', listenerRemover);
    }
  };
};


/** @const {!angular.Module} */
safelight.logPanel.module =
    angular.module('safelight.logPanel.module', [
      safelight.filterManager.module.name,
      safelight.textPanel.module.name,
    ])
    .directive('logPanel', safelight.logPanelDirective);
