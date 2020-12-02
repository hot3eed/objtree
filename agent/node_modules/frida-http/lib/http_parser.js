'use strict';

const HTTPParser = require('http-parser-js').HTTPParser;

module.exports = {
  methods: [
    'DELETE',
    'GET',
    'HEAD',
    'POST',
    'PUT',
    'CONNECT',
    'OPTIONS',
    'TRACE',
    'COPY',
    'LOCK',
    'MKCOL',
    'MOVE',
    'PROPFIND',
    'PROPPATCH',
    'SEARCH',
    'UNLOCK',
    'BIND',
    'REBIND',
    'UNBIND',
    'ACL',
    'REPORT',
    'MKACTIVITY',
    'CHECKOUT',
    'MERGE',
    'M-SEARCH',
    'NOTIFY',
    'SUBSCRIBE',
    'UNSUBSCRIBE',
    'PATCH',
    'PURGE',
    'MKCALENDAR',
    'LINK',
    'UNLINK'
  ],
  HTTPParser: HTTPParser
};
