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
goog.provide('safelight.textPanelDirective');

goog.require('safelight.TextPanelController');



/**
 * Widget for driving safelight.TextPanel.
 *
 * Usage:
 * <text-panel name='foo' ng-model='some.model'></text-panel>
 *
 * @return {!angular.Directive}
 */
safelight.textPanelDirective = function() {
  return {
    replace: true,
    restrict: 'E',
    priority: 100,
    scope: {
      name: '=',
      contents: '='
    },
    templateUrl: '/components/text_panel/text_panel_directive.html',
    controller: safelight.TextPanelController,
    controllerAs: 'textPanelCtrl',
    link: function(scope, iElement, iAttrs, ctrl) {
      if (iAttrs.name !== undefined) {
        ctrl.name = iAttrs.name;
      }
      if (iAttrs.contents !== undefined) {
        ctrl.contents = iAttrs.contents;
      }
    }
  };
};
