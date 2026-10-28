// config.local.js로 복사해서 실제 값으로 채운다. config.local.js는 .gitignore 대상이라 커밋되지 않는다.
//
// STATUS_SCRIPT가 호출될 때 -Json 플래그를 받아 stdout에 아래 필드를 가진 객체의 JSON 배열을 출력해야 한다(PowerShell의
// ConvertTo-Json -Depth 등으로 만들면 된다). 한글이 있다면 리다이렉트된 stdout에서도 UTF-8로 나오게 해야 한다(index.js의
// fetchStatus 주석 참고 — PowerShell은 [Console]::OutputEncoding을 UTF8로 먼저 설정해야 한다).
//
//   Project       string  프로젝트 식별자(PROJECT_ORDER의 값과 일치해야 한다)
//   Port          number | null   현재 리스닝 포트(중지 상태면 null)
//   PortWarning   string  비어있지 않으면 포트가 기대값과 다르다는 뜻(화면에 '*'로 표시)
//   Location      string  '중지됨'이면 중지된 것으로 표시(그 밖의 값은 자유)
//   Branch        string | null   git 브랜치명
//   Uncommitted   number | null   미커밋 변경 건수
//   Health        string  'HTTP 200'이면 정상, '응답없음'이면 빨간색, '-'는 중지됨과 동일하게 취급

export const STATUS_SCRIPT = 'C:\\path\\to\\your\\server-status.ps1';

export const PROJECT_ORDER = ['service-a', 'service-b', 'service-c'];

// false(기본값)면 2번째 칸과 범례의 해당 문구를 숨긴다. true면 "[B]브랜치명 M<건수>"를 표시한다.
export const SHOW_BRANCH_INFO = false;

// 테두리·제목 색 테마. theme.js의 THEMES 키 중 하나(모르는 값이면 기본값으로 되돌아간다).
export const THEME = 'peacock';
