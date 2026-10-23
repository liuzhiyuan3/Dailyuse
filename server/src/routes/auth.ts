import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../plugins/db';
import { code2Session, DevLoginDisabledError } from '../lib/wechat';
import { loginMode } from '../config';

interface LoginBody {
  code?: unknown;
}

interface ProfileBody {
  nickname?: unknown;
  avatarUrl?: unknown;
}

const NICKNAME_MAX = 24;
const AVATAR_MAX = 512;

/** 对外只暴露必要字段，openid 不外泄 */
function toPublicUser(u: { id: string; nickname: string | null; avatarUrl: string | null; createdAt: Date }) {
  return {
    id: u.id,
    nickname: u.nickname,
    avatarUrl: u.avatarUrl,
    createdAt: u.createdAt,
  };
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/auth/login', async (req, reply) => {
    const body = (req.body ?? {}) as LoginBody;
    const code = typeof body.code === 'string' ? body.code.trim() : '';

    if (!code) {
      return reply.code(400).send({ code: 400, message: '缺少 code' });
    }
    // wx.login 的 code 很短，超长一律视为垃圾请求
    if (code.length > 128) {
      return reply.code(400).send({ code: 400, message: 'code 格式不正确' });
    }

    let openid: string;
    try {
      openid = await code2Session(code);
    } catch (e) {
      if (e instanceof DevLoginDisabledError) {
        // 503 而不是 401：这是服务端没配好，不是用户身份问题，前端据此提示部署方
        return reply.code(503).send({ code: 503, message: e.message });
      }
      req.log.error(e);
      return reply.code(401).send({ code: 401, message: '微信登录失败，请重试' });
    }

    const user = await prisma.user.upsert({
      where: { openid },
      update: {},
      create: { openid },
    });

    const token = app.jwt.sign({ sub: user.id, openid: user.openid, dev: loginMode === 'dev' });

    return {
      code: 0,
      data: {
        token,
        user: toPublicUser(user),
        // dev = 调试登录，openid 是本地生成的；前端据此显示「调试账号」标记
        loginMode,
      },
      message: 'ok',
    };
  });

  // 当前登录用户资料：启动时用它校验 token 是否还有效
  app.get('/auth/me', { preHandler: app.authenticate }, async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) {
      // 用户被清库但 token 还在
      return reply.code(401).send({ code: 401, message: '用户不存在，请重新登录' });
    }
    return { code: 0, data: { user: toPublicUser(user), loginMode } };
  });

  app.patch('/auth/me', { preHandler: app.authenticate }, async (req, reply) => {
    const body = (req.body ?? {}) as ProfileBody;
    const data: { nickname?: string | null; avatarUrl?: string | null } = {};

    if (body.nickname !== undefined) {
      if (body.nickname !== null && typeof body.nickname !== 'string') {
        return reply.code(400).send({ code: 400, message: '昵称格式不正确' });
      }
      const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
      if (nickname.length > NICKNAME_MAX) {
        return reply.code(400).send({ code: 400, message: `昵称不能超过 ${NICKNAME_MAX} 个字` });
      }
      data.nickname = nickname || null;
    }

    if (body.avatarUrl !== undefined) {
      if (body.avatarUrl !== null && typeof body.avatarUrl !== 'string') {
        return reply.code(400).send({ code: 400, message: '头像地址格式不正确' });
      }
      const avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() : '';
      if (avatarUrl.length > AVATAR_MAX) {
        return reply.code(400).send({ code: 400, message: '头像地址过长' });
      }
      if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) {
        return reply.code(400).send({ code: 400, message: '头像地址必须是 http(s) 链接' });
      }
      data.avatarUrl = avatarUrl || null;
    }

    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ code: 400, message: '没有要更新的字段' });
    }

    const user = await prisma.user.update({ where: { id: req.user.sub }, data });
    return { code: 0, data: { user: toPublicUser(user) }, message: 'ok' };
  });

  // 退出登录：JWT 无状态，服务端只做语义占位，真正的清理由客户端删 token
  app.post('/auth/logout', async () => ({ code: 0, data: { ok: true } }));
};
