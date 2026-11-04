'use strict';

// Script checks for per-edition game names (rank/stats.js displayName).
const HANGUL = /[\uAC00-\uD7A3]/;
const KANA = /[\u3040-\u30FF]/;
const CJK = /[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7A3]/;
// Characters that exist only in Simplified Chinese (their Traditional forms are different characters). A name shared
// by TW and CN (e.g. 原神) has none of them, so it is never mistaken for Simplified.
const SIMPLIFIED_ONLY = /[国对说时无这为发业务会过来动经学们个战传龙剑荣决场击网络变风电线类质级养灵华热门乐阵剧欢极产轮鱼鸟马长书贝见车东阳险亲爱买卖两丽举义习乡乱亚从仓众优伤伦伟侠债仪儿兑党兰关兴兽册写军农冲况冻净减凤创别办励劲势勋区医协单卫厂厅历压县参叙叶号吓吗听启员响团园围图圆圣坏块坚坛垒墙壮声处备头夺奋奖妈娱孙宁宝实宠审宫宽将尔尘尝层属岁岛峡币帅师帐带帮应庙废开异弃张弹强归当录径忆态总恋恶悦惊惩愿户扑执扩扫扬抚护报担拟择挂挥损换据摄摆摇数断旧显晓暂术机杀杂权条杨构标树样档桥梦检楼欧残毁毕气汇汉汤没泛洁浅测济浓涛润涨渔温湾湿满灭灯灾炼烦烧爷独猎献现画畅疗痒盐监盖盘矿码确礼离积称竞笔简粮紧红约纪组细织终结给络绝统继绩续维综缘编罗职联肃肤胜脑脚脸艺节苏药营虑虽补规视觉览触评词试诗话诚询该误请诸读课谁调谈谢谱财责败账货购贪贫贵费赛赢赵跃践轻载较辅辉输边达迁运还进远连选遗邮释针钟钢钱铁银链销错锦键镇镜门闪闭问闲间闻队际陆陈随隐难静页顶项顺须领颜额饭饮馆驱验骑鲜鸡麦黄齐龄]/;

// Whether a store name belongs in an edition: Hangul only in ko, kana only in ja, no CJK in en, no Simplified-only characters in zh-tw.
const fitsEdition = (name, code) => {
  if (HANGUL.test(name) && code !== 'ko') return false;
  if (KANA.test(name) && code !== 'ja') return false;
  if (code === 'en' && CJK.test(name)) return false;
  return !(code === 'zh-tw' && SIMPLIFIED_ONLY.test(name));
};

module.exports = { HANGUL, KANA, CJK, fitsEdition };
