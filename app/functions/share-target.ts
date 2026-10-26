// 正常情况下"分享到食谱"由服务工作线程接住（public/share-target.js），不会走到这里。
// 万一它还没启动，别让用户看到报错页，跳回应用，#/shared 页会提示再分享一次。
export const onRequest: PagesFunction = ({ request }) => Response.redirect(new URL('/#/shared', request.url).href, 303);
