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

// Dataset of a ranking page (S: src/rank/stats.js loadRankStats()): the daily chart history from its first day to the
// latest, in the five markets the site collects. The site states no license, so none is given.
function datasetNode({ name, description, url }, S) {
  const first = S.days[0].date, last = S.today.date;
  return {
    '@context': 'https://schema.org', '@type': 'Dataset', name: name.replace(i18n.t('head.gamerscroll_2'), ''), description, url,
    creator: organizationRef(), publisher: { '@id': organizationId() },
    temporalCoverage: `${first}/${last}`,
    spatialCoverage: Object.values(S.COUNTRIES).map((country) => ({ '@type': 'Country', name: country })),
    measurementTechnique: i18n.t('rank.data_is_collected_several_times'),
    dateModified: last,
    isAccessibleForFree: true,
  };
}

module.exports = { X_URL, LOGO, operatorName, homeUrl, aboutUrl, organizationId, operatorId, websiteId, organizationRef, organizationNode, operatorNode, datasetNode };
