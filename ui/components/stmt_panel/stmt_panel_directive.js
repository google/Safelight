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
goog.provide('safelight.stmtPanel.module');
goog.provide('safelight.stmtPanelDirective');

goog.require('safelight.builder.module');
goog.require('safelight.htmlPanel.module');



/**
 * Directive for connecting a text-panel directive to monitor
 * the active filter's stmt output.
 *
 * @ngInject
 * @param {!safelight.Builder} builder
 * @return {!angular.Directive}
 */
safelight.stmtPanelDirective = function(builder) {
  return {
    restrict: 'A',
    require: 'htmlPanel',
    link: function(scope, element, attrs, htmlPanelCtrl) {
      if (!htmlPanelCtrl) {
        throw new Error('stmt-panel can only be applied to html-panel');
      }

      var listenerRemover = builder.addBuildListener(function(buildInfo) {
        htmlPanelCtrl.url = buildInfo ?
          builder.getStmtHtmlURL(buildInfo['signature'], buildInfo['target']) :
          '';
      });
      scope.$on('$destroy', listenerRemover);
    }
  };
};


/** @const {!angular.Module} */
safelight.stmtPanel.module =
    angular.module('safelight.stmtPanel.module', [
      safelight.builder.module.name,
      safelight.htmlPanel.module.name,
    ])
    .directive('stmtPanel', safelight.stmtPanelDirective);
