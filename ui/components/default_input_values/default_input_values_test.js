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
 * @fileoverview Contains unit tests for the Builder service.
 */
'use strict';

goog.setTestOnly();

goog.require('safelight.Argument');
goog.require('safelight.Buffer');
goog.require('safelight.defaultInputValues.module');



describe('safelight.DefaultInputValues', function() {
  var defaultInputValues;

  beforeEach(function() {
    module(safelight.defaultInputValues.module.name);
    inject(function(_defaultInputValues_) {
      defaultInputValues = _defaultInputValues_;
    });
  });

  it('should create a predictable buffer', function() {
    /** @type {!safelight.Argument} */
    var argument = safelight.Argument.fromDict({
      'name' : 'foo',
      'kind' : safelight.ArgumentKind.INPUT_BUFFER,
      'dimensions' : 3,
      'type_code' : safelight.ArgumentTypeCode.UINT,
      'type_bits' : 8
    });
    /** @type {!safelight.Buffer} */
    var b = defaultInputValues.makeInputBuffer(argument, 2, 3, 0);
    expect(b.elem_size).toEqual(1);
    expect(b.type_code).toEqual('uint');
    expect(b.dimensions).toEqual(3);
    expect(b.extent).toEqual([2, 3, 4, 0]);
    expect(b.stride).toEqual([1, 2, 6, 0]);
    expect(b.min).toEqual([0, 0, 0, 0]);
    expect(b.host.byteLength).toEqual(2 * 3 * 4);
    var expected = [
      0, 127, 0, 127, 0, 127,
      0, 0, 85, 85, 170, 170,
      0, 0, 127, 63, 127, 89,
      255, 255, 255, 255, 255, 255
    ];
    expect(new Uint8Array(b.host)).toEqual(new Uint8Array(expected));
  });
});

