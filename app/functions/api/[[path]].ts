// Cloudflare Pages 的服务端入口：/api/* 的请求都交给 server/ 里的 Hono 应用。
// 和网页同一个网址，不用单独部署 Worker，也没有跨域问题。
import { handle } from 'hono/cloudflare-pages';
import app from '../../server/index';

export const onRequest = handle(app);
