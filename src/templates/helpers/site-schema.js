'use strict';

// JSON-LD nodes of the site's source: the Organization that publishes GamerScroll, its operator (the pen name the about
// page uses) and the ranking Dataset. Ids and URLs are the edition's own canonical URLs; the about page carries the full
// Organization and Person nodes, other pages reference them by @id.
const i18n = require('../../i18n');

const X_URL = 'https://x.com/gamerscroll';
const LOGO = { '@type': 'ImageObject', url: 'https://gamerscroll.com/icon-192.png', width: 192, height: 192 };

const code = () => i18n.currentEdition().code;
const operatorName = (edition = code()) => (edition === 'ko' ? '플랑크톤' : 'Plankton');
const homeUrl = (edition = code()) => i18n.absoluteUrl(edition, '/');
const aboutUrl = (edition = code()) => i18n.absoluteUrl(edition, '/about/');
const organizationId = (edition = code()) => `${homeUrl(edition)}#organization`;
const operatorId = (edition = code()) => `${aboutUrl(edition)}#operator`;
const websiteId = (edition = code()) => `${homeUrl(edition)}#website`;

// A reference to the Organization that also carries the fields a consumer needs without resolving the @id.
const organizationRef = (edition = code()) => ({ '@type': 'Organization', '@id': organizationId(edition), name: i18n.t('head.gamerscroll'), url: homeUrl(edition), logo: LOGO });

function organizationNode(edition = code()) {
  return { '@context': 'https://schema.org', ...organizationRef(edition), sameAs: [X_URL], founder: { '@id': operatorId(edition) } };
}

function operatorNode(edition = code()) {
  return {
    '@context': 'https://schema.org', '@type': 'Person', '@id': operatorId(edition),
    name: operatorName(edition), url: aboutUrl(edition), worksFor: { '@id': organizationId(edition) },
  };
}

// The stores whose top-grossing charts a page of `country` shows: both, or the App Store alone where the market has no
// Google Play chart (China).
const datasetStores = (S, country) => ((S.today.rows[country] || {}).android || []).length ? i18n.t('rank.dataset_two_stores') : i18n.t('stats.app_store');

// The page title without the site name, whatever spacing precedes the "|".
const withoutBrand = (title) => title.replace(new RegExp(`\\s*\\|\\s*${i18n.t('head.gamerscroll').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`), '');

// Dataset of a ranking page (S: src/rank/stats.js loadRankStats()): exactly the data the page shows. description names its
// charts and that they are collected and updated daily (rank.dataset_* messages); spatialCoverage is the page's market;
// dateModified is the page's last data day. No start date, and as the site states no license, no license.
function datasetNode({ name, url, description, country, dateModified = null }, S) {
  return {
    '@context': 'https://schema.org', '@type': 'Dataset', name: withoutBrand(name), description, url,
    creator: organizationRef(), publisher: { '@id': organizationId() },
    spatialCoverage: [{ '@type': 'Country', name: S.COUNTRIES[country] }],
    measurementTechnique: i18n.t('rank.dataset_measurement'),
    dateModified: dateModified || S.today.date,
    isAccessibleForFree: true,
  };
}

module.exports = { X_URL, LOGO, operatorName, homeUrl, aboutUrl, organizationId, operatorId, websiteId, organizationRef, organizationNode, operatorNode, datasetStores, datasetNode };
