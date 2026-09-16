"""Diagnostics must stay bounded and cannot expose credentials in error text."""
import json
import unittest
from unittest.mock import MagicMock

import requests

from customs_diagnostics import probe_api


class DiagnosticTests(unittest.TestCase):
    def session(self, content=b'<response><resultCode>30</resultCode></response>', status=403):
        session = MagicMock()
        response = session.get.return_value.__enter__.return_value
        response.status_code = status
        response.headers = {}
        response.iter_content.return_value = [content]
        return session

    def test_authentication_error_still_proves_connectivity(self):
        session = self.session()
        result = probe_api('https', 'country', session)
        self.assertTrue(result['reachable'])
        self.assertEqual(result['http_status'], 403)
        self.assertEqual(result['api_code'], '30')
        kwargs = session.get.call_args.kwargs
        self.assertNotIn('params', kwargs)
        self.assertNotIn('headers', kwargs)
        self.assertFalse(kwargs['allow_redirects'])
        self.assertEqual(kwargs['timeout'], (10, 15))

    def test_exception_does_not_expose_url_credentials(self):
        session = self.session()
        session.get.side_effect = requests.exceptions.ConnectTimeout('https://secret:password@proxy/')
        result = probe_api('http', 'item', session)
        self.assertFalse(result['reachable'])
        self.assertEqual(result['error'], 'ConnectTimeout')
        self.assertNotIn('password', json.dumps(result))
        self.assertEqual(session.get.call_count, 1)

    def test_redirect_is_not_followed_or_full_url_logged(self):
        session = self.session(status=302)
        response = session.get.return_value.__enter__.return_value
        response.headers = {'Location': 'https://example.com/?key=private'}
        result = probe_api('http', 'country', session)
        self.assertEqual(result['redirect_host'], 'example.com')
        self.assertNotIn('private', json.dumps(result))
        response.iter_content.assert_not_called()

    def test_body_read_stops_at_limit(self):
        session = self.session()
        response = session.get.return_value.__enter__.return_value
        consumed = []
        def chunks():
            for i in range(100):
                consumed.append(i)
                yield b'x' * 4096
        response.iter_content.return_value = chunks()
        result = probe_api('https', 'item', session)
        self.assertFalse(result['xml'])
        self.assertEqual(len(consumed), 16)


if __name__ == '__main__':
    unittest.main()
