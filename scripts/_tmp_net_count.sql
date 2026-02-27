SELECT COUNT(*) AS cnt
FROM net._http_response
WHERE created >= NOW() - interval '2 hours';
