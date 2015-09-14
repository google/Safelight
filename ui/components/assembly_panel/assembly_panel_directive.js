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
goog.provide('safelight.assemblyPanel.module');
goog.provide('safelight.assemblyPanelDirective');

goog.require('safelight.builder.module');
goog.require('safelight.textPanel.module');



/**
 * Directive for connecting a text-panel directive to monitor
 * the active filter's assembly output.
 *
 * @ngInject
 * @param {!safelight.Builder} builder
 * @return {!angular.Directive}
 */
safelight.assemblyPanelDirective = function(builder) {
  return {
    restrict: 'A',
    require: 'textPanel',
    link: function(scope, element, attrs, textPanelCtrl) {
      if (!textPanelCtrl) {
        throw new Error('assembly-panel can only be applied to text-panel');
      }

      var listenerRemover = builder.addBuildListener(function(buildInfo) {
        if (buildInfo) {
          builder.getAssembly(buildInfo['signature'], buildInfo['target']).then(
            function(assembly) {
              textPanelCtrl.contents = assembly || 'Unable to get assembly';
            },
            function(error) {
              textPanelCtrl.contents = error || 'Unable to get assembly';
            }
          );
        } else {
          textPanelCtrl.contents = 'Unable to get assembly (build failed)';
        }
      });
      scope.$on('$destroy', listenerRemover);
    }
  };
};


/** @const {!angular.Module} */
safelight.assemblyPanel.module =
    angular.module('safelight.assemblyPanel.module', [
      safelight.builder.module.name,
      safelight.textPanel.module.name,
    ])
    .directive('assemblyPanel', safelight.assemblyPanelDirective);
