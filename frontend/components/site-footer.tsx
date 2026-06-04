export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-hairline bg-canvas px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-[1280px]">
        <p className="type-display-lg mb-12 max-w-md">Stock AI</p>
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <p className="type-caption mb-4">데이터</p>
            <ul className="space-y-2 type-body-sm">
              <li>FinanceDataReader</li>
              <li>KRX 실시간</li>
            </ul>
          </div>
          <div>
            <p className="type-caption mb-4">AI</p>
            <ul className="space-y-2 type-body-sm">
              <li>Google Gemini 2.5 Flash</li>
              <li>주가 분석 리포트</li>
            </ul>
          </div>
          <div>
            <p className="type-caption mb-4">안내</p>
            <p className="type-body-sm leading-relaxed">
              본 서비스는 투자 권유가 아닌 참고용 정보입니다.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
