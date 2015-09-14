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
goog.provide('safelight.imageZoomer.module');
goog.provide('safelight.imageZoomerController');
goog.provide('safelight.imageZoomerDirective');

goog.require('safelight.imagePreview.module');



/**
 * Directive added as an attribute to an element; this attribute
 * adds a click handler to the element that will display the buffer
 * at 'actual size' in a modal window.
 *
 * @ngInject
 * @param {!Object} $modal ui.bootstrap dialog service.
 * @param {!Function} $parse The angular $parse service.
 * @return {!angular.Directive}
 */
safelight.imageZoomerDirective = function($modal, $parse) {
  return {
      restrict: 'A',
      link: function(scope, element, attrs) {
        element.bind('click', function(e) {
          e.stopPropagation();
          element[0].blur();
          var valueGet = $parse(attrs.value);
          var buffer = valueGet(scope);
          $modal.open({
            'windowClass' : 'image-zoomer-window',
            'template': '<image-preview class="image-zoomer-fullsize" ' +
                'value="imageZoomerController.modalZoomImage"></image-preview>',
            'resolve': {
              modalZoomImage: function() {
                return buffer;
              }
            },
            'controller': 'imageZoomerController as imageZoomerController'
          });
        });
      }
    };
};



/**
 * Controller for imageZoomerDirective.
 * @struct @ngInject @export @constructor
 * @param {!Object} modalZoomImage buffer to display
 */
safelight.imageZoomerController = function(modalZoomImage) {
  /** @export @const {!Object} */
  this.modalZoomImage = modalZoomImage;
};



/** @const {!angular.Module} */
safelight.imageZoomer.module =
    angular.module('safelight.imageZoomer.module', [
      safelight.imagePreview.module.name
    ])
    .controller('imageZoomerController', safelight.imageZoomerController)
    .directive('imageZoomer', safelight.imageZoomerDirective);

