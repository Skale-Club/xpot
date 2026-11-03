// Reproduce the flyer symbols from the same installed icon library; no network dependency at runtime.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire('C:/Users/Vanildo/Dev/skaleclub/package.json');
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const si = require('react-icons/si');
const md = require('react-icons/md');
const fa = require('react-icons/fa');
const icons = { yelp: si.SiYelp, facebook: si.SiFacebook, tiktok: si.SiTiktok, website: md.MdLanguage,
  wifi: md.MdWifi, whatsapp: si.SiWhatsapp, youtube: si.SiYoutube, linkedin: fa.FaLinkedin };
const marks = Object.fromEntries(Object.entries(icons).map(([name, icon]) => {
  const svg = renderToStaticMarkup(createElement(icon));
  return [name, { paths: [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]) }];
}));
writeFileSync('print-pipeline/library/svg/service-marks.json', JSON.stringify(marks, null, 2) + '\n');
