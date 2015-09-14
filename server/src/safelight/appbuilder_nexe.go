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

package safelight

import (
	"bufio"
	"fmt"
	"io/ioutil"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

type nexeAppBuilder struct {
	tempDir string
	runCmd  RunCmd
}

// NewNexeAppBuilder creates and returns a new AppBuilder instance.
func NewNexeAppBuilder(tempDir string, logChan chan string, timeout time.Duration) (AppBuilder, error) {
	b := &nexeAppBuilder{
		tempDir: tempDir,
		runCmd:  NewRunCmd(tempDir, logChan, timeout),
	}
	return b, nil
}

// cpuFromHalideTarget returns the ISA within halideTarget.  If there is a format error,
// we return a non-nil error.
func cpuFromHalideTarget(halideTarget string) (string, error) {
	var prefixes = map[string]string{
		"arm-32-":   "arm",
		"pnacl-32-": "pnacl",
		"x86-32-":   "x86-32",
		"x86-64-":   "x86-64",
	}
	for prefix, cpu := range prefixes {
		if strings.Index(halideTarget, prefix) == 0 {
			return cpu, nil
		}
	}
	return "", fmt.Errorf("Malformed target: %v", halideTarget)
}

// buildNmf returns a NaCl manifest file in a byte array.  Error on malformed halideTarget.
func buildNmf(signature, halideTarget string) ([]byte, error) {
	const NMF = `
    {
      "files": {},
      "program": {
        "{{cpu}}": {
          "url": "/safelight_{{signature}}_{{halideTarget}}.nexe"
        }
      }
    }
    `
	cpu, err := cpuFromHalideTarget(halideTarget)
	if err != nil {
		return nil, err
	}
	nmf := strings.Replace(NMF, "{{signature}}", signature, -1)
	nmf = strings.Replace(nmf, "{{halideTarget}}", halideTarget, -1)
	nmf = strings.Replace(nmf, "{{cpu}}", cpu, -1)
	return []byte(nmf), nil
}

// buildGenerator returns filenames for a given filter's .nexe, .s, .stmt, and .html files.
// Example of invocation:
//    generatorName = example
//    pathToGen = generators/example_generator.cpp
//    halideTarget = x86-64-nacl-sse41
func (b *nexeAppBuilder) buildGenerator(generatorName, pathToGen, halideTarget string) (string, string, string, string, error) {

	fmt.Printf("Building %s for %s\n", generatorName, halideTarget)

	var args []string
	args = append(args,
		"safelight_"+generatorName,
		pathToGen)

	cmd := exec.Command(os.Getenv("SAFELIGHT_DIR")+"/buildSafelightGen.sh", args...)
	stdout, err := b.runCmd.RunCmdAndReturnStdout(cmd)

	if err != nil {
		return "", "", "", "", err
	}

	// For each output file type, create regex that will find filename
	var reNexe = regexp.MustCompile(fmt.Sprintf(`(.+/safelight_%s\.nexe)$`, generatorName))
	var reAssembly = regexp.MustCompile(fmt.Sprintf(`(.+/safelight_%s\.s)$`, generatorName))
	var reStmt = regexp.MustCompile(fmt.Sprintf(`(.+/safelight_%s\.stmt)$`, generatorName))
	var reHTML = regexp.MustCompile(fmt.Sprintf(`(.+/safelight_%s\.html)$`, generatorName))

	var nexeFn, assemblyFn, stmtFn, htmlFn string

	// Find filenames from stdout
	scanner := bufio.NewScanner(strings.NewReader(stdout))
	for scanner.Scan() {
		line := scanner.Text()
		fmt.Println(line)
		if reNexe.MatchString(line) {
			nexeFn = reNexe.FindStringSubmatch(line)[1]
		}
		if reAssembly.MatchString(line) {
			assemblyFn = reAssembly.FindStringSubmatch(line)[1]
		}
		if reStmt.MatchString(line) {
			stmtFn = reStmt.FindStringSubmatch(line)[1]
		}
		if reHTML.MatchString(line) {
			htmlFn = reHTML.FindStringSubmatch(line)[1]
		}
	}

	return nexeFn, assemblyFn, stmtFn, htmlFn, nil
}

// slurpIntoFilterInfo populates info's *FilterInfo Info field with file data from filename. The Info field is a map whose values hold
// the contents of the given filename. Keys correspond to artifact labels "nexe", "s"(assembly), "stmt", or "html".
func slurpIntoFilterInfo(filename, key string, info *FilterInfo) error {
	b, err := ioutil.ReadFile(filename)
	if err != nil {
		return err
	}
	info.Info[key] = b
	return nil
}

func (b *nexeAppBuilder) Build(generatorName, pathToGen, signature, halideTarget string) (*FilterInfo, error) {
	nexeFn, assemblyFn, stmtFn, htmlFn, err := b.buildGenerator(generatorName, pathToGen, halideTarget)
	if err != nil {
		return nil, fmt.Errorf("%v", err)
	}
	fmt.Printf("Generated artifacts are %s, %s, %s, %s\n", nexeFn, assemblyFn, stmtFn, htmlFn)
	fileArtifacts := map[string]string{
		nexeFn:     "nexe",
		assemblyFn: "s",
		stmtFn:     "stmt",
		htmlFn:     "html",
	}

	filterInfo := &FilterInfo{
		Signature: signature,
		Target:    halideTarget,
		Info:      map[string][]byte{},
	}
	for fn, key := range fileArtifacts {
		fmt.Printf("file: %s, key:%s\n", fn, key)
		err = slurpIntoFilterInfo(fn, key, filterInfo)
		if err != nil {
			fmt.Printf("Unable to copy file %v\n", fn)
			return nil, err
		}
	}

	nmf, err := buildNmf(signature, halideTarget)
	if err != nil {
		return nil, err
	}
	filterInfo.Info["nmf"] = nmf
	return filterInfo, nil
}
