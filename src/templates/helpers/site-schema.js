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
    name: operatorName(edition), alternateName: operatorName(edition === 'ko' ? 'en' : 'ko'),
    url: aboutUrl(edition), worksFor: { '@id': organizationId(edition) },
  };
}

// Dataset of a ranking page (S: src/rank/stats.js loadRankStats()): the ranking data the site collects and updates daily,
// in the five markets it covers. It states no start date and, as the site states no license, no license.
function datasetNode({ name, url }, S) {
  return {
    '@context': 'https://schema.org', '@type': 'Dataset', name: name.replace(i18n.t('head.gamerscroll_2'), ''),
    description: i18n.t('rank.dataset_description'), url,
    creator: organizationRef(), publisher: { '@id': organizationId() },
    spatialCoverage: Object.values(S.COUNTRIES).map((country) => ({ '@type': 'Country', name: country })),
    measurementTechnique: i18n.t('rank.dataset_measurement'),
    dateModified: S.today.date,
    isAccessibleForFree: true,
  };
}

module.exports = { X_URL, LOGO, operatorName, homeUrl, aboutUrl, organizationId, operatorId, websiteId, organizationRef, organizationNode, operatorNode, datasetNode };
