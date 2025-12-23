// queues/chatQueue.js
const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const connection = new IORedis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: null // Wajib untuk BullMQ
});

const chatQueue = new Queue('chatQueue', { connection });

module.exports = { chatQueue, connection };