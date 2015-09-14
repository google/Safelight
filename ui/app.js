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

goog.provide('safelight.application.module');

goog.require('safelight.alerter.module');
goog.require('safelight.assemblyPanel.module');
goog.require('safelight.builder.module');
goog.require('safelight.defaultInputValues.module');
goog.require('safelight.filterManager.module');
goog.require('safelight.htmlPanel.module');
goog.require('safelight.logPanel.module');
goog.require('safelight.naclSniffer.module');
goog.require('safelight.nexeModuleLoader.module');
goog.require('safelight.parameterPanel.module');
goog.require('safelight.runnerPanel.module');
goog.require('safelight.showTail.module');
goog.require('safelight.stmtPanel.module');
goog.require('safelight.textPanel.module');
goog.require('safelight.timingPanel.module');
goog.require('safelight.visualizer.module');



/**
 * The main module for the Safelight app.
 * @type {!angular.Module}
 */
safelight.application.module =
    angular.module('safelight.application', [
      'ngCookies',
      'ui.bootstrap',
      safelight.alerter.module.name,
      safelight.assemblyPanel.module.name,
      safelight.builder.module.name,
      safelight.defaultInputValues.module.name,
      safelight.filterManager.module.name,
      safelight.htmlPanel.module.name,
      safelight.logPanel.module.name,
      safelight.naclSniffer.module.name,
      safelight.nexeModuleLoader.module.name,
      safelight.parameterPanel.module.name,
      safelight.runnerPanel.module.name,
      safelight.showTail.module.name,
      safelight.stmtPanel.module.name,
      safelight.textPanel.module.name,
      safelight.timingPanel.module.name,
      safelight.visualizer.module.name
    ])
    .run([
      'alerter',
      'builder',
      'filterManager',
      'naclSniffer',
      function(alerter, builder, filterManager, naclSniffer) {
        // Ignore result: just forces naclSniffer to be instantiated
        // immediately, so that the NaCl fetch-and-load happens in parallel
        naclSniffer.getHalideTargets().then(
            function(targets) {
              console.log('Halide Targets: ' + targets);
            },
            function(failure) {
              console.log('NaCl failure: ' + failure);
              alerter.error(
                  'Native Client appears to be disabled; ' +
                  'please enable "Native Client" under ' +
                  'chrome://flags/#enable-nacl and restart Chrome. ');
            });
        // Bind the filterManager to the builder service by default.
        builder.addBuildListener(filterManager.loadFilter.bind(filterManager));
      }
    ]);
