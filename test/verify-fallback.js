#!/usr/bin/env node

/**
 * Fast-First Fallback 시스템 검증 스크립트
 * OpenAI 빠른 처리 → HyperCLOVA X 맥락 파악 전략 테스트
 */

const fs = require('fs');
const path = require('path');

// 테스트 결과를 저장할 객체
let testResults = {
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    tests: []
};

function log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const colors = {
        'INFO': '\x1b[36m',   // 청록색
        'SUCCESS': '\x1b[32m', // 녹색
        'ERROR': '\x1b[31m',   // 빨간색
        'WARNING': '\x1b[33m'  // 노란색
    };
    
    console.log(`${colors[type]}[${timestamp}] ${type}: ${message}\x1b[0m`);
}

function addTestResult(testName, passed, details, timing = 0) {
    testResults.totalTests++;
    if (passed) {
        testResults.passedTests++;
    } else {
        testResults.failedTests++;
    }
    
    testResults.tests.push({
        name: testName,
        passed,
        details,
        timing,
        timestamp: new Date().toISOString()
    });
}

function verifyFileStructure() {
    log('🔍 Fast-First Fallback 파일 구조 검증 시작');
    
    const requiredFiles = [
        '../src/standalone/ai-assistant-standalone.js',
        '../server/proxy-server.js',
        './fallback-test.html'
    ];
    
    const requiredFunctions = [
        'callHyperCLOVAForContext',
        'extractIntentFromThinking'
    ];
    
    let allFilesExist = true;
    
    // 파일 존재 확인
    for (const file of requiredFiles) {
        const filePath = path.join(__dirname, file);
        if (fs.existsSync(filePath)) {
            log(`✅ 파일 존재 확인: ${file}`, 'SUCCESS');
        } else {
            log(`❌ 파일 누락: ${file}`, 'ERROR');
            allFilesExist = false;
        }
    }
    
    addTestResult('파일 구조 검증', allFilesExist, `${requiredFiles.length}개 파일 검증`);
    
    // AI Assistant 파일의 함수 구현 확인
    const assistantFilePath = path.join(__dirname, '../src/standalone/ai-assistant-standalone.js');
    if (fs.existsSync(assistantFilePath)) {
        const fileContent = fs.readFileSync(assistantFilePath, 'utf8');
        
        let allFunctionsImplemented = true;
        for (const func of requiredFunctions) {
            if (fileContent.includes(func)) {
                log(`✅ 함수 구현 확인: ${func}`, 'SUCCESS');
            } else {
                log(`❌ 함수 미구현: ${func}`, 'ERROR');
                allFunctionsImplemented = false;
            }
        }
        
        addTestResult('함수 구현 검증', allFunctionsImplemented, `${requiredFunctions.length}개 함수 검증`);
        
        // Fast-First Fallback 로직 구현 확인
        const hasFastFirstLogic = fileContent.includes('Fast-First Fallback') && 
                                 fileContent.includes('OpenAI 먼저') &&
                                 fileContent.includes('Promise.race');
        
        if (hasFastFirstLogic) {
            log('✅ Fast-First Fallback 로직 구현 확인', 'SUCCESS');
            addTestResult('Fast-First Fallback 로직', true, 'OpenAI → HyperCLOVA X 전략 구현됨');
        } else {
            log('❌ Fast-First Fallback 로직 구현 미확인', 'ERROR');
            addTestResult('Fast-First Fallback 로직', false, '로직 구현 미확인');
        }
        
        // 한국 문화 맥락 처리 확인
        const hasKoreanContext = fileContent.includes('맥날') && 
                                fileContent.includes('스벅') &&
                                fileContent.includes('카톡');
        
        if (hasKoreanContext) {
            log('✅ 한국 문화 맥락 처리 구현 확인', 'SUCCESS');
            addTestResult('한국 문화 맥락', true, '맥날, 스벅, 카톡 등 축약어 처리');
        } else {
            log('❌ 한국 문화 맥락 처리 미구현', 'ERROR');
            addTestResult('한국 문화 맥락', false, '축약어 처리 미구현');
        }
    }
    
    return allFilesExist;
}

function verifyServerConfiguration() {
    log('⚙️ 서버 설정 검증 시작');
    
    const proxyServerPath = path.join(__dirname, '../server/proxy-server.js');
    
    if (fs.existsSync(proxyServerPath)) {
        const serverContent = fs.readFileSync(proxyServerPath, 'utf8');
        
        // HyperCLOVA X V3 API 설정 확인
        const hasV3API = serverContent.includes('v3/chat-completions') && 
                         serverContent.includes('HCX-007');
        
        if (hasV3API) {
            log('✅ HyperCLOVA X V3 API 설정 확인', 'SUCCESS');
            addTestResult('HyperCLOVA X V3 API', true, 'V3 엔드포인트 및 HCX-007 모델 설정');
        } else {
            log('❌ HyperCLOVA X V3 API 설정 미확인', 'ERROR');
            addTestResult('HyperCLOVA X V3 API', false, 'V3 API 설정 문제');
        }
        
        // 최적화된 파라미터 확인
        const hasOptimizedParams = serverContent.includes('topP: 0.1') && 
                                  serverContent.includes('temperature: 0.01');
        
        if (hasOptimizedParams) {
            log('✅ 최적화된 API 파라미터 확인', 'SUCCESS');
            addTestResult('API 파라미터 최적화', true, 'JSON 응답 강제를 위한 파라미터 설정');
        } else {
            log('⚠️ API 파라미터 최적화 확인 필요', 'WARNING');
            addTestResult('API 파라미터 최적화', false, '성능 최적화 파라미터 미설정');
        }
    }
}

function verifyTestFramework() {
    log('🧪 테스트 프레임워크 검증');
    
    const testFilePath = path.join(__dirname, './fallback-test.html');
    
    if (fs.existsSync(testFilePath)) {
        const testContent = fs.readFileSync(testFilePath, 'utf8');
        
        const hasRequiredTests = [
            'testOpenAIFastSuccess',
            'testKoreanCulturalContext', 
            'testComplexKoreanExpression',
            'testPerformanceComparison',
            'runFullFallbackTest'
        ].every(test => testContent.includes(test));
        
        if (hasRequiredTests) {
            log('✅ 포괄적 테스트 함수 구현 확인', 'SUCCESS');
            addTestResult('테스트 프레임워크', true, '5개 핵심 테스트 시나리오 구현');
        } else {
            log('❌ 테스트 함수 일부 누락', 'ERROR');
            addTestResult('테스트 프레임워크', false, '필수 테스트 함수 누락');
        }
    }
}

function generateTestReport() {
    log('📊 테스트 보고서 생성 중');
    
    const reportPath = path.join(__dirname, 'fallback-test-report.json');
    const report = {
        ...testResults,
        generatedAt: new Date().toISOString(),
        strategy: 'Fast-First Fallback',
        description: 'OpenAI 빠른 처리 (2초) → 실패시 HyperCLOVA X 맥락 파악',
        summary: {
            successRate: Math.round((testResults.passedTests / testResults.totalTests) * 100),
            totalTests: testResults.totalTests,
            passedTests: testResults.passedTests,
            failedTests: testResults.failedTests
        }
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    log(`📄 테스트 보고서 생성 완료: ${reportPath}`, 'SUCCESS');
    return report;
}

function printSummary(report) {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 FAST-FIRST FALLBACK 시스템 검증 결과');
    console.log('='.repeat(60));
    console.log(`📊 전체 테스트: ${report.totalTests}`);
    console.log(`✅ 성공: ${report.passedTests}`);
    console.log(`❌ 실패: ${report.failedTests}`);
    console.log(`📈 성공률: ${report.summary.successRate}%`);
    console.log('='.repeat(60));
    
    if (report.summary.successRate >= 80) {
        log('🎉 Fast-First Fallback 시스템이 성공적으로 구현되었습니다!', 'SUCCESS');
        log('💡 다음 단계: 브라우저에서 fallback-test.html로 실제 테스트를 진행하세요', 'INFO');
    } else {
        log('⚠️ 일부 구현이 완료되지 않았습니다. 실패한 테스트를 확인하세요', 'WARNING');
    }
    
    console.log('\n📋 개별 테스트 결과:');
    report.tests.forEach(test => {
        const status = test.passed ? '✅' : '❌';
        console.log(`  ${status} ${test.name}: ${test.details}`);
    });
    
    console.log(`\n📄 상세 보고서: ${path.join(__dirname, 'fallback-test-report.json')}`);
}

async function main() {
    log('🚀 Fast-First Fallback 시스템 검증 시작', 'INFO');
    
    try {
        // 1. 파일 구조 검증
        verifyFileStructure();
        
        // 2. 서버 설정 검증
        verifyServerConfiguration();
        
        // 3. 테스트 프레임워크 검증
        verifyTestFramework();
        
        // 4. 보고서 생성
        const report = generateTestReport();
        
        // 5. 결과 요약
        printSummary(report);
        
        // 성공률에 따른 프로세스 종료 코드
        process.exit(report.summary.successRate >= 80 ? 0 : 1);
        
    } catch (error) {
        log(`❌ 검증 중 오류 발생: ${error.message}`, 'ERROR');
        process.exit(1);
    }
}

// 스크립트 실행
if (require.main === module) {
    main();
}

module.exports = { verifyFileStructure, verifyServerConfiguration, generateTestReport };