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
goog.provide('safelight.imageLoader.module');
goog.provide('safelight.imageLoaderDirective');

goog.require('safelight.Alerter');
goog.require('safelight.Visualizer');
goog.require('safelight.visualizer.module');



/**
 * Directive added as an attribute to an element; this attribute
 * adds a click handler to the element that prompts the user to
 * load an image (PNG, GIF, JPG), which is then transmogrified
 * into the expected buffer layout, and the 'value' attribute is set to the
 * buffer. If there is an 'onvaluechanged' attribute, it is after
 * any change is made.
 *
 * @ngInject
 * @param {Function} $parse The angular $parse service.
 * @param {!safelight.Alerter} alerter
 * @param {!safelight.Visualizer} visualizer
 * @return {!angular.Directive}
 */
safelight.imageLoaderDirective = function($parse, alerter, visualizer) {
  return {
      restrict: 'A',
      link: function(scope, element, attrs) {
        var onImageLoad = function() {
          var valueGet = $parse(attrs.value);
          var valueSet = valueGet.assign;
          var old_buffer = valueGet(scope);
          var new_buffer = visualizer.imageToBuffer(this);
          visualizer.transmogrifyRGBA8Buffer(new_buffer,
                                             old_buffer.type_code,
                                             old_buffer.elem_size * 8,
                                             old_buffer.dimensions)
              .then(
                  function(buffer) {
                    valueSet(scope, buffer);
                    if (buffer.dimensions != 3 ||
                        buffer.type_code != 'uint' ||
                        buffer.elem_size != 1) {
                      var msg =
                          'This input requires a ' + buffer.dimensions +
                          '-dimensional ' + buffer.type_code +
                          (buffer.elem_size * 8) + ' image; ' +
                          'the image you loaded has been modified ' +
                          'but may not be exact.';
                      alerter.warning(msg);
                    }
                    scope.$eval(attrs['onvaluechanged']);
                  },
                  function(alwaysNull) {
                    // deliberately broken image
                    valueSet(scope, safelight.Buffer.fromDict({
                      host: { },
                      extent: [0, 0, 0, 0],
                      stride: [0, 0, 0, 0],
                      min: [0, 0, 0, 0],
                      elem_size: 1,
                      dimensions: 3,
                      type_code: 'uint'
                    }));
                    scope.$eval(attrs['onvaluechanged']);
                  });
        };

        var filePicker = document.createElement('input');
        filePicker.type = 'file';
        filePicker.accept = 'image/jpeg,image/png,image/gif';
        filePicker.onchange = function(pickEvt) {
          var imgToRead = new Image();
          imgToRead.onload = onImageLoad;
          var fr = new FileReader();
          fr.onload = function(loadEvt) {
            imgToRead.src = loadEvt.target.result;
          };
          if (pickEvt.target.files[0]) {
            fr.readAsDataURL(pickEvt.target.files[0]);
          }
        };
        filePicker.setAttribute('style',
            'visibility:hidden;position:absolute;top:-50;left:-50;');
        element.append(filePicker);
        element.bind('click', function(e) {
          e.stopPropagation();
          filePicker.click();
          element[0].blur();
        });
      }
    };
};


/** @const {!angular.Module} */
safelight.imageLoader.module =
    angular.module('safelight.imageLoader.module', [
      safelight.visualizer.module.name
    ])
    .directive('imageLoader', safelight.imageLoaderDirective);
