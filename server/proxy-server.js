require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const crypto = require('crypto');

const app = express();
const PORT = 3001;

// NCP API Gateway 인증 시그니처 생성
function generateNCPSignature(accessKey, secretKey, method, uri, timestamp) {
  const newline = "\n";
  const space = " ";
  const message = method + space + uri + newline + timestamp + newline + accessKey;
  
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(message, 'utf8');
  return hmac.digest('base64');
}

// CORS 설정 - NCP API 헤더 지원
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-NCP-CLOVASTUDIO-REQUEST-ID',
    'X-NCP-CLOVASTUDIO-API-KEY',
    'X-NCP-APIGW-API-KEY',
    'X-NCP-IAM-ACCESS-KEY',
    'X-NCP-APIGW-SIGNATURE-V2',
    'X-NCP-APIGW-TIMESTAMP'
  ]
}));

app.use(express.json());

// HyperCLOVA X API 프록시 엔드포인트 (NCP 인증)
app.post('/api/hyperclova', async (req, res) => {
  try {
    console.log('HyperCLOVA X 프록시 요청 받음:', {
      body: JSON.stringify(req.body, null, 2),
      headers: req.headers
    });

    // NCP 인증 정보 추출 (환경변수 또는 요청 헤더에서)
    const accessKey = req.headers['x-ncp-iam-access-key'] || process.env.NCP_ACCESS_KEY;
    const secretKey = process.env.NCP_SECRET_KEY; // 보안상 환경변수에서만
    const clovaApiKey = req.headers['x-ncp-clovastudio-api-key'] || 
                       req.headers.authorization?.replace('Bearer ', '');

    if (!accessKey || !secretKey || !clovaApiKey) {
      return res.status(400).json({
        error: 'NCP 인증 정보가 필요합니다',
        details: 'NCP_ACCESS_KEY, NCP_SECRET_KEY 환경변수와 X-NCP-CLOVASTUDIO-API-KEY 헤더가 필요합니다'
      });
    }

    // NCP API Gateway 인증 헤더 생성
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const uri = '/testapp/v1/chat-completions/HCX-007';
    const signature = generateNCPSignature(accessKey, secretKey, 'POST', uri, timestamp);

    console.log('NCP 인증 정보:', {
      accessKey,
      timestamp,
      signature: signature.substring(0, 10) + '...' // 일부만 로그
    });

    // V3 API에서 지원되는 모델만 사용
    const supportedModels = ['HCX-007'];
    
    // HCX-007 모델만 시도
    for (const model of supportedModels) {
      try {
        console.log(`${model} 모델로 시도 중...`);
        
        // CLOVA Studio Chat Completions V3 엔드포인트 사용
        const apiUrl = `https://clovastudio.stream.ntruss.com/v3/chat-completions/${model}`;
        
        console.log(`V3 API URL: ${apiUrl}`);
        
        // V3 API에 맞게 요청 바디 변환 - 극한 속도 최적화 + JSON 강제
        const v3RequestBody = {
          messages: req.body.messages,
          topP: 0.1,  // JSON 응답 강제를 위해 대폭 감소
          topK: 1,    // 가장 확률 높은 토큰만 선택
          temperature: 0.01,  // 거의 결정적 응답
          maxCompletionTokens: 100,  // JSON 응답을 위해 약간 증가
          repetitionPenalty: 1.0,
          includeAiFilters: false,
          seed: 1234
        };
        
        // 시스템 메시지 최적화 (토큰 수 줄이기)
        if (v3RequestBody.messages && v3RequestBody.messages.length > 0 && v3RequestBody.messages[0].role === 'system') {
          v3RequestBody.messages[0].content = v3RequestBody.messages[0].content
            .replace(/\n\n/g, '\n')  // 이중 개행 제거
            .replace(/\s+/g, ' ')    // 여러 공백 단일화
            .substring(0, 1000);     // 시스템 메시지 1000자 제한
        }
        
        const hyperclovaResponse = await fetch(apiUrl,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${clovaApiKey}`,
              'X-NCP-CLOVASTUDIO-REQUEST-ID': req.headers['x-ncp-clovastudio-request-id'] || 
                                             crypto.randomUUID(),
              'Content-Type': 'application/json; charset=utf-8',
              'Accept': 'application/json'
            },
            body: JSON.stringify(v3RequestBody)
          }
        );

        console.log(`${model} 응답 상태:`, hyperclovaResponse.status);
        
        if (hyperclovaResponse.ok) {
          console.log(`✅ ${model} 모델 사용 성공`);
          
          // V3 API JSON 응답 처리
          const data = await hyperclovaResponse.json();
          console.log(`${model} 성공 응답:`, JSON.stringify(data, null, 2));
          return res.json(data);
        } else if (hyperclovaResponse.status === 400) {
          const errorText = await hyperclovaResponse.text();
          const errorData = JSON.parse(errorText);
          
          if (errorData.status?.code === '40084') {
            console.log(`${model} 모델 지원되지 않음, 다른 모델 시도`);
            continue; // 다음 모델 시도
          } else {
            throw new Error(`${model}: ${errorText}`);
          }
        } else {
          const errorText = await hyperclovaResponse.text();
          throw new Error(`${model}: HTTP ${hyperclovaResponse.status} - ${errorText}`);
        }
        
      } catch (fetchError) {
        console.error(`${model} 시도 실패:`, fetchError.message);
        if (model === supportedModels[supportedModels.length - 1]) {
          throw fetchError; // 마지막 모델도 실패하면 오류 발생
        }
      }
    }
    
    // 모든 모델이 실패한 경우
    throw new Error('지원되는 모델을 찾을 수 없습니다.');
    
  } catch (error) {
    console.error('프록시 서버 오류:', error);
    res.status(500).json({
      error: 'HyperCLOVA X API 호출 실패',
      details: error.message
    });
  }
});

// 서버 상태 확인 엔드포인트
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'HyperCLOVA X 프록시 서버 실행 중' });
});

app.listen(PORT, () => {
  console.log(`🚀 HyperCLOVA X 프록시 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`📡 프록시 엔드포인트: http://localhost:${PORT}/api/hyperclova`);
  console.log(`🔍 상태 확인: http://localhost:${PORT}/health`);
});