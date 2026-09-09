'use strict';

// 실제 빌드의 탐색·선택·반응형 동작만 검증한다.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const baseURL = process.env.PREVIEW_URL || 'http://127.0.0.1:4175';
const homeOnly = process.env.HOME_ONLY === '1';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
  const failures = [];
  const run = async (label, test) => {
    if (homeOnly && !/홈|화이트/.test(label)) return;
    if (process.env.CHECK_FILTER && !label.includes(process.env.CHECK_FILTER)) return;
    try { await test(); console.log(`PASS ${label}`); }
    catch (error) { failures.push(`${label}: ${error.message}`); console.error(`FAIL ${label}: ${error.message}`); }
  };
  try {
    for (const width of (process.env.VIEWPORT_WIDTHS || '1280,1440,1920,390').split(',').map(Number)) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: 'light', reducedMotion: 'reduce' });
      const page = await context.newPage();
      // 외부 광고·분석·이미지는 로컬 레이아웃과 기능 검증의 대상이 아니다.
      await page.route('**/*', route => {
        const url = route.request().url();
        if (homeOnly && route.request().resourceType() === 'image') return route.continue();
        return url.startsWith(baseURL) || url.startsWith('data:') ? route.continue() : route.abort();
      });
      const visit = async (route) => {
        const response = await page.goto(new URL(route, baseURL).href, { waitUntil: 'networkidle' });
        assert.equal(response.status(), 200, route);
      };
      await run(`${width}px 홈 선택·탭·상세 링크`, async () => {
        await visit('/');
        const firstTitle = await page.locator('#rk-home-preview h2').textContent();
        const buttons = page.locator('.rk-hpanel [data-rk-preview]:visible');
        const secondName = await buttons.nth(1).textContent();
        await buttons.nth(1).click();
        assert.equal(await page.locator('#rk-home-preview h2').textContent(), secondName);
        assert.notEqual(secondName, firstTitle);
        assert.equal(await buttons.nth(1).getAttribute('aria-pressed'), 'true');
        await page.locator('label[for="ht-ccu"]').click();
        assert.equal(await page.locator('.rk-hpanel.ccu .rk-list').isVisible(), true);
        assert.match(await page.locator('#rk-home-preview').textContent(), /스팀 동접자/);
        const detail = await page.locator('#rk-home-preview .rk-preview-link').getAttribute('href');
        await visit(detail);
        assert.ok(await page.locator('h1').isVisible());
        assert.equal(await page.locator('.rk-chartsvg').count() > 0, true);
      });
      await run(`${width}px 모바일 순위·전체 펼치기`, async () => {
        await visit('/rankings/');
        const column = page.locator('.rk-col.and');
        assert.equal(await column.locator('.rk-list li:visible').count(), 20);
        await column.locator('.rk-more').click();
        assert.ok(await column.locator('.rk-list li:visible').count() > 20);
        if (width <= 768) {
          await page.locator('label[for="rk-st-ios"]').click();
          assert.equal(await column.isVisible(), false);
          assert.equal(await page.locator('.rk-col.ios').isVisible(), true);
        }
      });
      await run(`${width}px 홈 행 전체 선택·연속 클릭·상세 이동`, async () => {
        await visit('/');
        for (const id of ['and', 'ios', 'ccu', 'sell']) {
          await page.locator(`label[for="ht-${id}"]`).click();
          const rows = page.locator(`.rk-hpanel.${id} .rk-list li`);
          for (const [index, area] of [[1, 'edge'], [2, 'img'], [3, '.rt'], [4, 'button']]) {
            const row = rows.nth(index);
            const name = await row.locator('[data-rk-preview]').textContent();
            if (area === 'edge') await row.click({ position: { x: 4, y: 24 } });
            else await row.locator(area).first().click();
            assert.equal(await page.locator('#rk-home-preview h2').textContent(), name);
            assert.equal(await row.locator('[data-rk-preview]').getAttribute('aria-pressed'), 'true');
          }
        }
        const detail = page.locator('.rk-hpanel.sell .nm a').first();
        const href = await detail.getAttribute('href');
        await detail.click();
        await page.waitForURL(new URL(href, baseURL).href);
        assert.ok(await page.locator('h1').isVisible());
      });
      await run(`${width}px 홈 이미지 제거·소개 가독성`, async () => {
        await visit('/');
        assert.equal(await page.locator('.rk-home-heading img').count(), 0, '소개 이미지 제거');
        const title = await page.locator('h1').boundingBox();
        const heading = await page.locator('.rk-home-heading').boundingBox();
        assert.ok(title.width <= heading.width, '제목 폭');
        assert.ok(heading.height < 180, '이미지 제거 후 소개 영역 축소');
      });
      await run(`${width}px 스팀 판매 바로가기·동접 수치`, async () => {
        await visit('/steam/#sell');
        assert.equal(await page.locator('#sell').isVisible(), true);
        if (width <= 768) await page.locator('label[for="rk-st-and"]').click();
        assert.equal(await page.locator('.rk-list.steam:not(.sell) .num').first().isVisible(), true);
      });
      await run(`${width}px 게임 DB 검색·빈 결과`, async () => {
        await visit('/games/');
        await page.locator('.search-input:visible').fill('메이플');
        if (width <= 768) await page.locator('.search-btn:visible').click();
        else await page.locator('.search-input:visible').press('Enter');
        await page.locator('#search-results-grid a').first().waitFor();
        const href = await page.locator('#search-results-grid a').first().getAttribute('href');
        await visit(href);
        assert.ok(await page.locator('h1').isVisible());
        await visit('/games/?q=zzzz-no-such-game-99999');
        await page.getByText('일치하는 게임이 없습니다.', { exact: false }).waitFor();
      });
      await visit('/');
      const monthly = await page.locator('a[href^="/rankings/monthly/"]').first().getAttribute('href');
      await run(`${width}px 홈 1~10위와 분석 박스 정렬`, async () => {
        assert.equal(await page.locator('.rk-home-heading a').count(), 0);
        for (const id of ['and', 'ios', 'ccu', 'sell']) {
          await page.locator(`label[for="ht-${id}"]`).click();
          const rows = page.locator(`.rk-hpanel.${id} .rk-list li`);
          assert.equal(await rows.count(), 10);
          if (width <= 768) continue;
          const first = await rows.first().boundingBox();
          const last = await rows.last().boundingBox();
          // 목록 열은 10행 + '전체 보기' 버튼(.rk-hmore)까지가 한 덩어리 — 분석 박스는 그 바닥선에 맞춘다.
          const more = page.locator(`.rk-hpanel.${id} .rk-hmore`);
          const moreBox = (await more.count()) ? await more.first().boundingBox() : null;
          const columnBottom = moreBox ? moreBox.y + moreBox.height : last.y + last.height;
          const panel = await page.locator('#rk-home-preview').boundingBox();
          assert.ok(Math.abs(first.y - panel.y) <= 2, `${id} 상단 ${first.y} / ${panel.y}`);
          assert.ok(Math.abs(columnBottom - panel.y - panel.height) <= 2, `${id} 하단 ${columnBottom} / ${panel.y + panel.height}`);
          const overflow = await page.locator('#rk-home-preview').evaluate(el => el.scrollHeight - el.clientHeight);
          assert.ok(overflow <= 2, `${id} 분석 내용 넘침 ${overflow}px`);
        }
      });
      await page.emulateMedia({ colorScheme: 'dark' });
      for (const route of (homeOnly ? ['/'] : ['/', '/rankings/', '/rankings/jp/', '/rankings/free/', '/rankings/subculture/', monthly, '/rankings/global/', '/rankings/records/', '/rankings/publishers/', '/rankings/about/', '/steam/', '/steam/730/', '/games/', '/games/메이플-키우기/', '/reports/', '/magazine/ranking/subculture-august-2026-kr/'])) {
        await run(`${width}px ${route === '/' ? '홈 ' : ''}가로 넘침·제목 ${route}`, async () => {
          await visit(route);
          const geometry = await page.evaluate(() => ({
            viewport: window.innerWidth,
            scroll: document.documentElement.scrollWidth,
          }));
          assert.ok(geometry.scroll <= geometry.viewport + 1, JSON.stringify(geometry));
          assert.equal(await page.locator('h1').count(), 1);
          assert.equal(await page.locator('a[href="/upcoming/"], a[href="/upcoming.html"]').count(), 0, '출시 예정 메뉴·관련 링크 제거');
          if (width > 768) {
            const edges = await page.evaluate(() => {
              const main = document.querySelector('.site-container');
              const mainRect = main.getBoundingClientRect();
              const mainStyle = getComputedStyle(main);
              const footer = document.querySelector('.site-footer');
              const footerStyle = getComputedStyle(footer);
              return {
                left: mainRect.left + parseFloat(mainStyle.paddingLeft),
                right: mainRect.right - parseFloat(mainStyle.paddingRight),
                logo: document.querySelector('.gs-logo').getBoundingClientRect().left,
                search: document.querySelector('.gs-search').getBoundingClientRect().right,
                title: (document.querySelector('h1').closest('.rk-hero') || document.querySelector('h1')).getBoundingClientRect().left,
                footer: footer.getBoundingClientRect().left + parseFloat(footerStyle.paddingLeft),
              };
            });
            for (const key of ['logo', 'title', 'footer']) {
              assert.ok(Math.abs(edges[key] - edges.left) <= 2, `${key} 좌측 기준선 ${JSON.stringify(edges)}`);
            }
            assert.ok(Math.abs(edges.search - edges.right) <= 2, `검색창 우측 기준선 ${JSON.stringify(edges)}`);
          }
          if (route !== '/') {
            assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(255, 255, 255)', '다크 환경에서도 화이트 배경');
          }
        });
      }
      await run(`${width}px 홈 상단 광고 표시 시 배치`, async () => {
        await visit('/');
        const ad = page.locator('.rk-home-ad');
        assert.equal(await ad.count(), 1, '기존 광고만 이동하고 중복하지 않음');
        const slot = ad.locator('ins:visible');
        assert.equal(await slot.count(), 1, '화면에 맞는 광고 슬롯 하나');
        // 실제 광고 요청·클릭 없이 광고가 채워진 상태의 공간을 재현한다.
        await slot.evaluate(el => {
          const sample = document.createElement('div');
          sample.textContent = '광고 영역 · 레이아웃 확인용';
          Object.assign(sample.style, { width: '100%', height: '100%', background: '#f5f5f7', display: 'grid', placeItems: 'center', color: '#6e6e73', font: '12px sans-serif' });
          el.appendChild(sample);
        });
        const adBox = await slot.boundingBox();
        const hero = await page.locator('.rk-home-heading').boundingBox();
        const summary = await page.locator('.rk-hcards').boundingBox();
        assert.ok(adBox.height >= (width > 768 ? 90 : 100), '광고 규격 높이 확보');
        assert.ok(adBox.y + adBox.height <= hero.y, '광고 아래 소개 배너');
        assert.ok(hero.y + hero.height <= summary.y + 1, '소개 아래 요약 지표');
        assert.ok(adBox.x >= 0 && adBox.x + adBox.width <= width, '광고 가로 넘침 없음');
        await page.screenshot({ path: require('node:path').resolve(__dirname, `../mockups/home-ad-layout-${width}.png`) });
      });
      await run(`${width}px 홈 하단 링크·월간 TOP 3 중앙 정렬`, async () => {
        await visit('/');
        assert.equal(await page.locator('.rk-market-heading p').count(), 0, '순위 제목 옆 수집 안내 제거');
        assert.equal(await page.locator('.rk-hmovers .rk-hcard').nth(1).locator('h3 small').count(), 0, '신규 진입 보조 문구 제거');
        assert.equal(await page.locator('.rk-home > .rk-section > h2 a').count(), 0, '전체 보기 링크는 제목에서 분리');
        const reports = page.locator('.rk-section-footer').locator('..');
        const cards = await reports.locator('.rk-cards').boundingBox();
        const footer = await reports.locator('.rk-section-footer').boundingBox();
        assert.ok(footer.y >= cards.y + cards.height, '리포트 목록 아래 전체 보기');
        if (width > 768) {
          const podium = page.locator('.rk-hmonth .rk-podium');
          const bounds = await podium.boundingBox();
          for (const item of await podium.locator('a').all()) {
            const box = await item.boundingBox();
            assert.ok(Math.abs(box.y + box.height / 2 - bounds.y - bounds.height / 2) <= 2, 'TOP 3 게임의 세로 중앙 배치');
          }
        }
        await page.locator('.rk-month-section').screenshot({ path: require('node:path').resolve(__dirname, `../mockups/home-month-centered-${width}.png`) });
      });
      await run(`${width}px 홈 화이트 테마 유지`, async () => {
        await page.emulateMedia({ colorScheme: 'dark' });
        await visit('/');
        const colors = await page.evaluate(() => ({
          bg: getComputedStyle(document.body).backgroundColor,
          text: getComputedStyle(document.querySelector('h1')).color,
        }));
        assert.equal(colors.bg, 'rgb(255, 255, 255)');
        assert.equal(colors.text, 'rgb(29, 29, 31)');
        assert.equal(await page.locator('.rk-workspace').evaluate(el => getComputedStyle(el).display), 'grid');
        if (width <= 768) {
          const bounds = await page.evaluate(() => ({
            title: document.querySelector('h1').getBoundingClientRect().top,
            nav: document.querySelector('.nav').getBoundingClientRect().bottom,
            search: getComputedStyle(document.querySelector('body > .search-container .search-box')).backgroundColor,
          }));
          assert.ok(bounds.title >= bounds.nav, `고정 메뉴가 제목을 가립니다: ${JSON.stringify(bounds)}`);
          assert.equal(bounds.search, 'rgb(245, 245, 247)');
        }
      });
      if (homeOnly) {
        const path = require('node:path');
        // 외부 광고를 제외한 실제 빌드 화면을 PC·태블릿·모바일 크기로 보관한다.
        await page.screenshot({ path: path.resolve(__dirname, `../mockups/white-home-${width}.png`), fullPage: false });
      }
      await context.close();
    }
    if (!process.env.VIEWPORT_WIDTHS) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await run('네이티브 홈 탭 키보드 전환', async () => {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
      await page.locator('#ht-and').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#ht-ios').isChecked(), true);
      assert.equal(await page.locator('.rk-hpanel.ios .rk-list').isVisible(), true);
    });
    await context.close();
    }
  } finally {
    await browser.close();
  }
  if (failures.length) throw new Error(`${failures.length} checks failed:\n${failures.join('\n')}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
