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
goog.provide('safelight.parameterPanel.module');

goog.require('safelight.ParameterPanelController');
goog.require('safelight.imageLoader.module');
goog.require('safelight.imagePreview.module');
goog.require('safelight.imageZoomer.module');
goog.require('safelight.parameterPanelDirective');
goog.require('safelight.toNumber.module');



/** @const {!angular.Module} */
safelight.parameterPanel.module =
    angular.module('safelight.parameterPanel.module', [
      safelight.imageLoader.module.name,
      safelight.imagePreview.module.name,
      safelight.imageZoomer.module.name,
      safelight.toNumber.module.name
    ])
    .controller('ParameterPanelController', safelight.ParameterPanelController)
    .directive('parameterPanel', safelight.parameterPanelDirective);
