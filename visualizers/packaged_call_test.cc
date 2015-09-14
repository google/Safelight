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
#include "visualizers/packaged_call_runtime.h"
#include "packaged_call_tester.h"
#include "json/json.h"
#include "googletest/include/gtest/gtest.h"

namespace photos_editing_halide {

using std::string;
using std::unique_ptr;
using std::vector;

namespace {

class ArgumentPackagerJsoncpp
    : public packaged_call_runtime::ArgumentPackagerJson {
 public:
  explicit ArgumentPackagerJsoncpp(const Json::Value& input_message)
      : input_message_(new JsoncppValue(input_message)),
        output_message_(new JsoncppValue(Json::Value(Json::objectValue))) {}

  const Json::Value& GetResults() const {
    return static_cast<const JsoncppValue*>(output_message_.get())->GetVar();
  }

 protected:
  class JsoncppValue : public JsonValue {
   public:
    explicit JsoncppValue(const Json::Value& var) : var_(var) {}
    bool IsUndefined() const override { return var_.isNull(); }
    bool IsMap() const override { return var_.isObject(); }
    bool AsBool(bool* value) const override {
      if (var_.isBool()) {
        *value = var_.asBool();
        return true;
      }
      return false;
    }
    bool AsInt32(int32_t* value) const override {
      if (var_.isNumeric()) {
        *value = static_cast<int32_t>(var_.asInt());
        return true;
      }
      return false;
    }
    bool AsDouble(double* value) const override {
      if (var_.isNumeric()) {
        *value = var_.asDouble();
        return true;
      }
      return false;
    }
    bool AsByteArray(vector<uint8_t>* v) const override {
      if (var_.isArray()) {
        const int len = var_.size();
        v->resize(len);
        for (int i = 0; i < len; ++i) {
          (*v)[i] = static_cast<uint8_t>(var_[i].asInt());
        }
        return true;
      }
      return false;
    }
    bool AsInt32Array(vector<int32_t>* v) const override {
      if (var_.isArray()) {
        const int len = var_.size();
        v->resize(len);
        for (int i = 0; i < len; ++i) {
          (*v)[i] = static_cast<int32_t>(var_[i].asInt());
        }
        return true;
      }
      return false;
    }
    unique_ptr<JsonValue> GetMember(const string& key) const override {
      Json::Value var;
      if (var_.isObject()) {
        var = var_[key];
      }
      return unique_ptr<JsonValue>(new JsoncppValue(var));
    }
    bool SetMember(const string& key,
                   const unique_ptr<JsonValue>& value) override {
      if (var_.isObject()) {
        var_[key] = static_cast<const JsoncppValue*>(value.get())->var_;
        return true;
      }
      return false;
    }

    const Json::Value& GetVar() const { return var_; }

   private:
    Json::Value var_;
  };

  unique_ptr<JsonValue> NewMap() const override {
    return unique_ptr<JsonValue>(
        new JsoncppValue(Json::Value(Json::objectValue)));
  }

  unique_ptr<JsonValue> NewInt32Array(const int32_t* data,
                                      size_t len) const override {
    Json::Value array_buf(Json::arrayValue);
    array_buf.resize(len);
    for (Json::ArrayIndex i = 0; i < len; ++i) {
      array_buf[i] = data[i];
    }
    return unique_ptr<JsonValue>(new JsoncppValue(array_buf));
  }

  unique_ptr<JsonValue> NewByteArray(const uint8_t* data,
                                     size_t len) const override {
    Json::Value data_buf(Json::arrayValue);
    data_buf.resize(len);
    for (Json::ArrayIndex i = 0; i < len; ++i) {
      data_buf[i] = data[i];
    }
    return unique_ptr<JsonValue>(new JsoncppValue(data_buf));
  }

  unique_ptr<JsonValue> NewInt32(int32_t i) const override {
    return unique_ptr<JsonValue>(new JsoncppValue(Json::Value(i)));
  }

  unique_ptr<JsonValue> NewDouble(double d) const override {
    return unique_ptr<JsonValue>(new JsoncppValue(Json::Value(d)));
  }

  unique_ptr<JsonValue> NewString(const string& s) const override {
    return unique_ptr<JsonValue>(new JsoncppValue(Json::Value(s)));
  }

  const JsonValue* GetInputMessage() const override {
    return input_message_.get();
  }

  JsonValue* GetOutputMessage() const override { return output_message_.get(); }

 private:
  unique_ptr<JsonValue> input_message_;
  unique_ptr<JsonValue> output_message_;
};

}  // namespace

namespace {

TEST(PackagedCall, TestDescribe) {
  string json_raw;
  bool success = packaged_call_runtime::MetadataToJSON(
      &packaged_call_tester_metadata, &json_raw);
  EXPECT_TRUE(success);

  Json::Value results;
  Json::Reader reader;
  EXPECT_TRUE(reader.parse(json_raw, results));

  // Verify that name and target are present and plausible, then overwrite
  // (since specific values vary by build env)
  EXPECT_TRUE(results.isMember("name"));
  EXPECT_TRUE(results["name"].isString());
  results["name"] = "some_name";

  EXPECT_TRUE(results.isMember("target"));
  EXPECT_TRUE(results["target"].isString());
  results["target"] = "some_target";

  static const char* kJsonExpected = R"z_delimiter_z({
   "arguments" : [
      {
         "kind" : 0,
         "name" : "__user_context",
         "type_bits" : 64,
         "type_code" : "handle"
      },
      {
         "dimensions" : 3,
         "kind" : 1,
         "name" : "input1",
         "type_bits" : 8,
         "type_code" : "uint"
      },
      {
         "dimensions" : 3,
         "kind" : 1,
         "name" : "input2",
         "type_bits" : 8,
         "type_code" : "uint"
      },
      {
         "def" : 1,
         "kind" : 0,
         "max" : 10,
         "min" : 0,
         "name" : "f",
         "type_bits" : 32,
         "type_code" : "float"
      },
      {
         "def" : 1,
         "kind" : 0,
         "max" : 10,
         "min" : 0,
         "name" : "d",
         "type_bits" : 64,
         "type_code" : "float"
      },
      {
         "def" : true,
         "kind" : 0,
         "name" : "b",
         "type_bits" : 1,
         "type_code" : "uint"
      },
      {
         "def" : 8,
         "kind" : 0,
         "max" : 255,
         "min" : 0,
         "name" : "u8",
         "type_bits" : 8,
         "type_code" : "uint"
      },
      {
         "def" : 16,
         "kind" : 0,
         "max" : 255,
         "min" : 0,
         "name" : "u16",
         "type_bits" : 16,
         "type_code" : "uint"
      },
      {
         "def" : 32,
         "kind" : 0,
         "max" : 255,
         "min" : 0,
         "name" : "u32",
         "type_bits" : 32,
         "type_code" : "uint"
      },
      {
         "def" : 64,
         "kind" : 0,
         "max" : 255,
         "min" : 0,
         "name" : "u64",
         "type_bits" : 64,
         "type_code" : "uint"
      },
      {
         "def" : 8,
         "kind" : 0,
         "max" : 127,
         "min" : 0,
         "name" : "i8",
         "type_bits" : 8,
         "type_code" : "int"
      },
      {
         "def" : 16,
         "kind" : 0,
         "max" : 255,
         "min" : 0,
         "name" : "i16",
         "type_bits" : 16,
         "type_code" : "int"
      },
      {
         "def" : 32,
         "kind" : 0,
         "max" : 255,
         "min" : 0,
         "name" : "i32",
         "type_bits" : 32,
         "type_code" : "int"
      },
      {
         "def" : 64,
         "kind" : 0,
         "max" : 255,
         "min" : 0,
         "name" : "i64",
         "type_bits" : 64,
         "type_code" : "int"
      },
      {
         "dimensions" : 3,
         "kind" : 2,
         "name" : "f.0",
         "type_bits" : 8,
         "type_code" : "uint"
      },
      {
         "dimensions" : 3,
         "kind" : 2,
         "name" : "f.1",
         "type_bits" : 8,
         "type_code" : "uint"
      },
      {
         "dimensions" : 3,
         "kind" : 2,
         "name" : "f.2",
         "type_bits" : 8,
         "type_code" : "uint"
      }
   ],
   "name" : "some_name",
   "target" : "some_target",
   "version" : 0
}
)z_delimiter_z";

  // Parse into canonical form to ease the comparison
  Json::StyledWriter writer;
  std::string json_actual = writer.write(results);
  EXPECT_EQ(kJsonExpected, json_actual);
}

TEST(PackagedCall, TestCall) {
  static const char* kInputsJson = R"z_delimiter_z({
   "input1" : {
     "host": [0],
     "extent": [1, 1, 1, 0],
     "stride": [1, 1, 1, 0],
     "min": [0, 0, 0, 0],
     "elem_size": 1
   },
   "input2" : {
     "host": [1],
     "extent": [1, 1, 1, 0],
     "stride": [1, 1, 1, 0],
     "min": [0, 0, 0, 0],
     "elem_size": 1
   },
   "b" : true,
   "d" : 1,
   "f" : 1,
   "i16" : 16,
   "i32" : 32,
   "i64" : 64,
   "i8" : 8,
   "u16" : 16,
   "u32" : 32,
   "u64" : 64,
   "u8" : 8
})z_delimiter_z";

  Json::Reader reader;
  Json::Value inputs;
  EXPECT_TRUE(reader.parse(kInputsJson, inputs));

  Json::Value message;
  message["verb"] = "call";
  message["inputs"] = inputs;

  ArgumentPackagerJsoncpp packager(message);
  int status = packaged_call_runtime::MakePackagedCall(
      nullptr, &packaged_call_tester_metadata, packaged_call_tester_argv,
      &packager);
  EXPECT_EQ(0, status);

  Json::Value results = packager.GetResults();

  // Verify that time_usec is present and numeric, then overwrite to zero
  // (since specific time can vary in test environment)
  EXPECT_TRUE(results.isMember("time_usec"));
  EXPECT_TRUE(results["time_usec"].isNumeric());
  results["time_usec"] = 0;

  static const char* kJsonExpected = R"z_delimiter_z({
   "outputs" : {
      "f.0" : {
         "dimensions" : 3,
         "elem_size" : 1,
         "extent" : [ 1, 1, 1, 0 ],
         "host" : [ 1 ],
         "min" : [ 0, 0, 0, 0 ],
         "stride" : [ 1, 1, 1, 0 ],
         "type_code" : "uint"
      },
      "f.1" : {
         "dimensions" : 3,
         "elem_size" : 1,
         "extent" : [ 1, 1, 1, 0 ],
         "host" : [ 64 ],
         "min" : [ 0, 0, 0, 0 ],
         "stride" : [ 1, 1, 1, 0 ],
         "type_code" : "uint"
      },
      "f.2" : {
         "dimensions" : 3,
         "elem_size" : 1,
         "extent" : [ 1, 1, 1, 0 ],
         "host" : [ 128 ],
         "min" : [ 0, 0, 0, 0 ],
         "stride" : [ 1, 1, 1, 0 ],
         "type_code" : "uint"
      }
   },
   "time_usec" : 0
}
)z_delimiter_z";

  Json::StyledWriter writer;
  std::string json_actual = writer.write(results);
  EXPECT_EQ(kJsonExpected, json_actual);
}

}  // namespace
}  // namespace photos_editing_halide

