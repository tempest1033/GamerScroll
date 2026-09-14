# 매출 모델 연구 사이클

운영 사이트와 분리된 실험 도구입니다. **차트 순위를 실제 매출액으로 확정하거나 자동 배포하지 않습니다.**

Monthly service rehearsal and its blocked release gates are documented in
[`rank-model-service-readiness.md`](../../docs/research/rank-model-service-readiness.md).
The default public renderer remains disabled; the local preview does not deploy.

## 사용법

Python 3.11 이상과 Node.js가 필요합니다. 연구용 가상환경에서만 의존성을 설치합니다.

```powershell
python -m venv .venv-revenue
.\.venv-revenue\Scripts\python.exe -m pip install -r scripts/revenue-research/requirements.txt

# 원장·관측 패널 → 실험 → 보고서 → 필수 검증
node scripts/revenue-research/run-cycle.js --phase all --python .\.venv-revenue\Scripts\python.exe

# 기존 계산 결과만 보고서로 정리
node scripts/revenue-research/run-cycle.js --phase report
```

`--phase build|simulate|report|verify`로 필요한 단계만 실행할 수 있습니다. `verify`는 이 연구 코드의 필수 검사만 수행하며 사이트 전체 테스트나 빌드는 하지 않습니다. 실패 원인과 실행 환경은 `reports/rank-models/research-cycle-*.json`에 남습니다.

전체 날짜 누락 민감도는 별도 비용이 큰 실험입니다.

```powershell
node scripts/revenue-research/run-cycle.js --phase simulate --python .\.venv-revenue\Scripts\python.exe --calendar-sensitivity
```

`--calendar-sensitivity`는 동일 관측 가중·선형 시간 가중 각각의 58개 누락 사례와 경계 확장 진단을 실행합니다. 누락 날짜를 좋은 결과에 맞춰 고르지 않으며, 긴 실행이므로 기존 완료 결과를 다시 만들 필요가 있을 때만 사용합니다.

이 사이클은 **2026년 8월 자료의 재현용**입니다. 날짜만 바꿔 새 달 매출을 학습하지 않습니다. 새 기간에는 해당 기간의 금액 원장과 순위 패널을 따로 연결해야 합니다. `--games-from-panel`로 만든 새 기간 패널은 식별 정보만 재사용하고 기존 달 금액은 제거합니다.

## 관리 지점

| 대상 | 관리 위치 |
| --- | --- |
| 원문 금액·출처·기간·스토어 | `docs/research/anchors/manual/`, `docs/research/same-month-market-evidence-2026-09-10.json` |
| 원장 정규화·ID·사용 가능 상태 | `scripts/anchors/lib/anchor-schema.js` |
| 기존 상태 문자열의 명시적 변환 | `scripts/anchors/lib/legacy-evidence-status.json` |
| 실험 곡선·그룹·목적함수 | `candidates.json`, `grouping-candidates.json` |
| 순위 관측 집계·표준 솔버 | `simulate.py` |
| 상대 최소제곱·최대 상대 오차 비교 | `convex-objectives.py` |
| 기존 보정안 고정·새 자료 예측 | `frozen_models.py` |
| 새 기간 시간 적분·경계 관측 처리 | `temporal_transfer.py` |
| 금액·순서 평가 지표 | `../lib/revenue-model-metrics.js` |

원장 v2 ID는 출처·게임·국가·기간 시작/종료·기간 종류·스토어·통화·수수료·세금 기준·수치 한정자를 포함합니다. 과거 ID는 `legacy_ids`에 남고, 여러 스토어로 갈라진 과거 ID는 `resolveAnchorId`가 `ambiguous`로 반환합니다. 원본 원장은 `docs/research/anchors/anchors.pre-scope-v2.jsonl`에 보존됩니다. 같은 완전 범위에 서로 다른 금액이 들어오면 조용히 덮어쓰지 않고 실패합니다.

새 수동 자료는 `evidence_role`과 `review_status`를 명시해야 합니다. 출처 단위의 명시적 기본값도 사용할 수 있습니다. 설명 문장에 `review` 같은 단어가 있다는 이유로 사용 가능 여부를 바꾸지 않습니다.

## 결과 해석

- **금액 오차:** RMS log ratio, MAPE, WAPE, MAE/RMSE, 최대 오차, 합계 편향을 분리합니다.
- **순서:** Spearman, Kendall tau-b, 역전 쌍 수를 사용합니다. 전체 시장이 아닌 비교한 표본 안의 순서입니다.
- **중첩·누락 검사:** 표본을 반복 선택한 과거 노출과 겹치는 폴드의 의존성은 사라지지 않습니다.
- **시장 상한:** 같은 달 Sensor Tower 시장액과 AppMagic 게임액을 섞은 실험은 공급업체 간 시나리오로 표시합니다.
- **일본 순위 프로파일:** 같은 오차를 내는 계수를 임의로 하나 고르지 않습니다. 조건부 TOP 200 비중과 전체 스토어 시장 비중을 구분합니다.
- **선형계획 범위:** 알려진 조건에서 가능한 범위이며 신뢰구간이 아닙니다. 미관측 매출은 미지수로 남기고 게임별 운영 보정 배수로 사용하지 않습니다.
- **9월 일간 대조:** 8월 보정안을 고정한 시간대 민감도 실험입니다. 공급업체의 집계 시간대는 확인되지 않았으며 3일·한 게임으로 다음 달 정확도를 주장하지 않습니다.
- **9월 주간 대조:** 원문의 “첫 주”를 9월 1~7일로 가정합니다. 미학습 게임도 포함하지만 날짜 경계·9월 시장 총액이 미확정인 조건부 실험이며, 계수 선택에 사용하지 않습니다.

평균 오차가 작다는 이유만으로 시장 총액 위반·스토어 기여 소멸·미확정 상품군을 무시하지 않습니다. 운영 적용 판단에는 같은 범위의 추가 금액 표본과 별도 기간 검증이 필요합니다.

## 9월 11일 확장 연구

`docs/research/revenue-model-expanded-cycle-2026-09-11.md`에 다른 달·주간·스토어별 추가 자료와 비교 결과를 정리했습니다. 새 스토어 자료로 남긴 세 후보는 연구용이며, 13라운드안이나 운영 모델을 대체하지 않습니다.

- `weekly_clock_lag.py`: 시간대와 가정 지연을 중복 없는 구간으로 비교합니다. `--resume`은 같은 입력의 완료 구간을 재계산하지 않습니다.
- `store_order_dominance.py`: 시장 배수나 특정 곡선 지수로 해결할 수 없는 조건부 순서 충돌을 찾습니다.
- `frozen_store_validation.py`, `store_pareto.py`: 보존 후보의 스토어별 성능을 비교하고, 어느 쪽에서도 더 나쁜 후보만 제거합니다. 미래 순서로 후보를 선택하지 않습니다.
- `compare_live_archive.py`: 외부 보존 스토어 차트와 시간상 인접한 자체 기록을 대조합니다. 업체의 월간 매출 추정표와 구분합니다.
- `verify_expanded.py`, `test_expanded_models.py`: 확장 자료의 부모 파일 해시·범위·후보 연결과 새 동작을 검사합니다. 이전 대규모 탐색을 다시 실행하지 않습니다.

후속 진단은 보존된 결과를 단계별로 재사용합니다.

- `expanded_store_cohort.py` → `resolved_link_delta.py`: 새 게임 비교와 전체 DOM 링크 정정으로 빠졌던 비교만 추가합니다. 원래 잘린 ID 파일은 덮어쓰지 않습니다.
- `expanded_order_dominance.py` → `remaining_order_feasibility.py`: 공통 단조 곡선의 개별 쌍 충돌을 찾고, 아직 닫히지 않은 경우에만 전체 순서 가능성을 계산합니다.
- `weekly_latent_budgets.py` → `intraday_order_relaxation.py` → `exact_order_certificate.py` → `lag_relaxed_order.py`: 날짜별 예산·하루 안 배분·지연 조건을 차례로 완화합니다. 가능한 배분은 실측 데이터나 운영 보정값이 아닙니다.
- `earlier_provider_consistency.py`: 6·7월의 서로 다른 추정 상품을 비교합니다. 자체 순위 이력이 없는 기간의 모델 정확도를 계산하지 않습니다.
- `earlier_device_scope.py`, `earlier_internal_consistency.py`: iPad 포함 여부와 같은 추정 상품 내부의 스토어별 일관성을 분리합니다. 통과한 모델 코드는 변경하지 않습니다.
- `test_order_identification.py`: 공동 순서 가능성, 정수 증명, 실제 관측 경계 및 추정 상품 간 순서 비교의 동작 계약을 검사합니다.

새 결과만 점검할 때는 `verify_expanded.py --only <검사 이름 ...> --output <별도 확인서 경로>`를 사용합니다. 이전 확인서를 덮어쓰거나 이미 통과한 모델 탐색을 재실행할 필요가 없습니다.

추가 3시간 연구는 `docs/research/revenue-extension-2026-09-11/README.md`에 별도로 정리했습니다. 국가 수집 범위의 효과, 지역 미관측 매출의 중복 계산 방지, 새 일간 순서 대조와 미연결 게임의 불확실성을 다루며, 기존 모델을 대체하지 않습니다. 이 추가분의 전용 검사는 `test_extension_models.py`, `verify_extension.py`입니다.
