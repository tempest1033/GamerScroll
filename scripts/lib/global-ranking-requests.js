'use strict';

// Apple 요청은 국가별 병렬 작업과 관계없이 한 줄로 보내고 간격을 유지한다.
// 403은 접근 거부로 취급한다. 헤더/IP 변경이나 반복 요청으로 우회하지 않는다.
function createAppleClient({
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  intervalMs = 1000,
  timeoutMs = 20000,
  maxCooldownMs = 180000
} = {}) {
  let queue = Promise.resolve();
  let nextAt = 0;
  let blocked = null;
  let cooldownUsed = 0;

  async function request(url, headers) {
    if (blocked) {
      const error = new Error(`Apple requests deferred: ${blocked}`);
      error.deferred = true;
      throw error;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      await sleep(Math.max(0, nextAt - now()));
      nextAt = now() + intervalMs;
      let response;
      try {
        response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      } catch (error) {
        if (attempt === 2 || !['TypeError', 'TimeoutError'].includes(error.name)) throw error;
        nextAt = Math.max(nextAt, now() + 3000 * 2 ** attempt);
        continue;
      }
      if (response.ok) return response.json();
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      const retryAfter = response.headers.get('retry-after');
      await response.body?.cancel();
      if (response.status === 403) {
        blocked = 'HTTP 403';
        throw error;
      }
      if (response.status === 429) {
        const seconds = retryAfter && Number(retryAfter);
        const parsed = retryAfter ? Date.parse(retryAfter) : NaN;
        const requested = retryAfter && Number.isFinite(seconds)
          ? seconds * 1000 : Number.isFinite(parsed) ? parsed - now() : 60000;
        const delay = Math.max(60000 * 2 ** attempt, requested);
        if (attempt === 2 || cooldownUsed + delay > maxCooldownMs) {
          blocked = 'HTTP 429; cooldown budget exhausted';
          throw error;
        }
        cooldownUsed += delay;
        nextAt = Math.max(nextAt, now() + delay);
        continue;
      }
      if (response.status >= 500 && attempt < 2) {
        nextAt = Math.max(nextAt, now() + 3000 * 2 ** attempt);
        continue;
      }
      throw error;
    }
  }

  return (url, headers = {}) => {
    const result = queue.then(() => request(url, headers));
    queue = result.catch(() => {});
    return result;
  };
}

module.exports = { createAppleClient };
