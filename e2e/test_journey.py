"""Browser journey tests for the Mentora demo prototype.

Runs against the real app in the system Chrome via Playwright, served from www/.
Only demo content is exercised. Learning State is never shown.
"""
import json
import os
import re
import socket
import subprocess
import sys
import time
import urllib.request
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright, expect

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
WWW = os.path.join(ROOT, 'www')
SHOTS = os.path.join(ROOT, 'e2e', 'screenshots')
CHROME = '/usr/bin/google-chrome'
STORAGE_KEY = 'mentora.demo.progress.v1'
LEARNING_STATE_TERMS = ['stable', 'unstable', 'not_learned', 'UNDECIDED', 'Learning State', 'primary']

results = []
REQUEST_HOSTS = set()


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def check(name, condition, detail=''):
    results.append((name, bool(condition), detail))
    mark = 'PASS' if condition else 'FAIL'
    print(f'[{mark}] {name}' + (f' :: {detail}' if detail and not condition else ''))


def app_text(page):
    return page.locator('#app').inner_text()


def ascii_digits_in(text):
    return re.findall(r'[0-9]', text)


def main():
    os.makedirs(SHOTS, exist_ok=True)
    port = free_port()
    server = subprocess.Popen(
        [sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', WWW],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    base = f'http://127.0.0.1:{port}/index.html'
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen(base, timeout=0.5)
                break
            except Exception:
                time.sleep(0.1)
        run(base)
    finally:
        server.terminate()
        server.wait(timeout=5)
    failed = [r for r in results if not r[1]]
    print(f'\n{len(results) - len(failed)}/{len(results)} browser checks passed')
    if failed:
        for name, _, detail in failed:
            print(f'  FAILED: {name} {detail}')
        sys.exit(1)


def run(base):
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        console_errors = []

        def new_page(viewport=(390, 844), init_script=None):
            ctx = browser.new_context(viewport={'width': viewport[0], 'height': viewport[1]}, locale='fa-IR')
            if init_script:
                ctx.add_init_script(init_script)
            page = ctx.new_page()
            page.on('pageerror', lambda e: console_errors.append(f'pageerror: {e}'))
            page.on('console', lambda m: console_errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
            page.on('response', lambda r: console_errors.append(f'HTTP {r.status} {r.url}') if r.status >= 400 else None)
            page.on('request', lambda r: REQUEST_HOSTS.add(urlparse(r.url).hostname))
            return ctx, page

        # ---------- 1. Fresh load: RTL, chapter, demo label, Persian digits
        ctx, page = new_page()
        page.goto(base)
        expect(page.locator('#title')).to_have_text('کیهان، زادگاه عناصر')
        check('html is RTL Persian', page.get_attribute('html', 'dir') == 'rtl' and page.get_attribute('html', 'lang') == 'fa')
        check('chapter title is the verified title', page.locator('#title').inner_text() == 'کیهان، زادگاه عناصر')
        check('demo badge is shown on chapter page', page.locator('.badge').first.inner_text() == 'نمونه آزمایشی')
        check('chapter counter uses Persian digits', '۰ از ۳' in app_text(page), app_text(page))
        check('no ASCII digits on chapter screen', not ascii_digits_in(app_text(page)), str(ascii_digits_in(app_text(page))))
        check('no Learning State terms visible', not any(t in app_text(page) for t in LEARNING_STATE_TERMS))
        check('Vazirmatn font file is bundled in www/fonts', os.path.exists(os.path.join(WWW, 'fonts', 'Vazirmatn-Regular.woff2')),
              'missing www/fonts/Vazirmatn-Regular.woff2')
        font_status = page.evaluate("""async () => {
          try { await document.fonts.load('16px Vazirmatn'); } catch (e) { /* reported via status below */ }
          return [...document.fonts].filter(f => f.family.replace(/"/g, '') === 'Vazirmatn').map(f => f.status);
        }""")
        check('Vazirmatn @font-face loads from the app itself', bool(font_status) and all(x == 'loaded' for x in font_status), str(font_status))
        check('title receives focus on render', page.evaluate("document.activeElement && document.activeElement.id") == 'title')
        page.screenshot(path=os.path.join(SHOTS, '01_chapter_mobile.png'), full_page=True)

        # ---------- 2. Lesson screen
        page.get_by_role('button', name='شروع درس').click()
        expect(page.locator('#title')).to_have_text('درس نمونه ۱')
        body = app_text(page)
        check('lesson body shows the placeholder text', 'این متن جای‌نگهدار است' in body)
        check('lesson states body is not verified textbook', 'محتوای درسی تأییدشده' in body)
        page.screenshot(path=os.path.join(SHOTS, '02_lesson_mobile.png'), full_page=True)

        # ---------- 3. Question 1, Next disabled before answering
        page.get_by_role('button', name='شروع تمرین').click()
        expect(page.locator('.prompt')).to_contain_text('حاصل ۲ + ۳')
        check('question counter shows سؤال ۱ از ۳', 'سؤال ۱ از ۳' in app_text(page))
        next_btn = page.get_by_role('button', name='سؤال بعدی')
        check('next is disabled before answering', next_btn.is_disabled())
        choices = page.locator('button.choice')
        check('three choices are rendered', choices.count() == 3, str(choices.count()))
        check('choices are Persian digits', choices.nth(0).inner_text() == '۴' and choices.nth(1).inner_text() == '۵')
        heights = [choices.nth(i).bounding_box()['height'] for i in range(3)]
        check('choice touch targets are at least 44px tall', min(heights) >= 44, str(heights))

        # ---------- 4. Wrong answer -> immediate feedback, persisted
        choices.nth(0).click()
        feedback = page.locator('.feedback')
        expect(feedback).to_contain_text('نادرست است')
        check('wrong feedback names the correct answer in Persian digits', 'پاسخ درست: ۵' in feedback.inner_text(), feedback.inner_text())
        check('choices lock after answering', choices.nth(0).is_disabled() and choices.nth(1).is_disabled())
        check('correct choice is highlighted', 'is-correct' in choices.nth(1).get_attribute('class'))
        check('wrong choice is highlighted', 'is-wrong' in choices.nth(0).get_attribute('class'))
        check('next is enabled after answering', next_btn.is_enabled())
        saved = json.loads(page.evaluate(f"localStorage.getItem('{STORAGE_KEY}')"))
        check('wrong answer is persisted with correct=false', saved['answers']['q1'] == {'selectedIndex': 0, 'correct': False}, str(saved))
        page.screenshot(path=os.path.join(SHOTS, '03_feedback_wrong_mobile.png'), full_page=True)

        # Clicking another choice after answering must not change the answer
        choices.nth(1).click(force=True)
        saved2 = json.loads(page.evaluate(f"localStorage.getItem('{STORAGE_KEY}')"))
        check('answer cannot be changed after feedback', saved2['answers']['q1']['selectedIndex'] == 0)

        # ---------- 5. Advance, then refresh mid-practice
        next_btn.click()
        expect(page.locator('.prompt')).to_contain_text('حاصل ۱۰ − ۴')
        check('advanced to question 2', 'سؤال ۲ از ۳' in app_text(page))
        page.reload()
        expect(page.locator('.prompt')).to_contain_text('حاصل ۱۰ − ۴')
        check('refresh keeps the user at question 2', 'سؤال ۲ از ۳' in app_text(page))
        kept = json.loads(page.evaluate(f"localStorage.getItem('{STORAGE_KEY}')"))
        check('refresh keeps the q1 answer recorded', kept['answers']['q1']['selectedIndex'] == 0, str(kept))

        # ---------- 6. Answer q2 correctly, q3 correctly -> result
        page.locator('button.choice').nth(0).click()  # '۶' correct for q2
        expect(page.locator('.feedback')).to_contain_text('درست است')
        page.get_by_role('button', name='سؤال بعدی').click()
        expect(page.locator('.prompt')).to_contain_text('حاصل ۳ × ۴')
        check('last question uses the result button label', page.get_by_role('button', name='مشاهدهٔ نتیجه').count() == 1)
        page.locator('button.choice').nth(1).click()  # '۱۲' correct for q3
        expect(page.locator('.feedback')).to_contain_text('درست است')
        page.get_by_role('button', name='مشاهدهٔ نتیجه').click()
        expect(page.locator('.big')).to_have_text('۲ از ۳')
        check('result shows 2 of 3 correct in Persian digits', page.locator('.big').inner_text() == '۲ از ۳')
        check('result percentage is 67 (rounded) in Persian digits', '۶۷٪' in app_text(page), app_text(page))
        check('result has no ASCII digits', not ascii_digits_in(app_text(page)))
        page.screenshot(path=os.path.join(SHOTS, '04_result_mobile.png'), full_page=True)

        # ---------- 7. Refresh on result keeps result; back to chapter shows 3 answered
        page.reload()
        expect(page.locator('.big')).to_have_text('۲ از ۳')
        check('refresh keeps the result screen', page.locator('.big').inner_text() == '۲ از ۳')
        page.get_by_role('button', name='بازگشت به فصل').click()
        check('chapter shows 3 of 3 answered after completion', '۳ از ۳ پاسخ ثبت‌شده' in app_text(page), app_text(page))

        # ---------- 8. Restart clears answers
        page.get_by_role('button', name='شروع درس').click()
        page.get_by_role('button', name='تمرین دوباره از ابتدا').click()
        page.get_by_role('button', name='فصل').click()
        check('restart clears all recorded answers', '۰ از ۳ پاسخ ثبت‌شده' in app_text(page), app_text(page))
        cleared = json.loads(page.evaluate(f"localStorage.getItem('{STORAGE_KEY}')"))
        check('restart persists an empty answers object', cleared['answers'] == {}, str(cleared))

        # ---------- 9. Keyboard: Tab to a choice, Enter selects it
        page.get_by_role('button', name='شروع درس').click()
        page.get_by_role('button', name='شروع تمرین').click()
        page.locator('button.choice').nth(1).focus()
        page.keyboard.press('Enter')
        expect(page.locator('.feedback')).to_contain_text('درست است')
        check('keyboard Enter selects and gives feedback', 'درست است' in app_text(page))
        ctx.close()

        # ---------- 10. Corrupted storage: unparsable JSON
        ctx, page = new_page()
        page.goto(base)
        page.evaluate(f"localStorage.setItem('{STORAGE_KEY}', '{{not json')")
        page.reload()
        expect(page.locator('.banner')).to_contain_text('نامعتبر بود')
        check('unparsable storage shows a recovery notice', 'نامعتبر بود' in page.locator('.banner').inner_text())
        check('unparsable storage falls back to the chapter screen', '۰ از ۳' in app_text(page))
        page.reload()
        check('recovery notice is shown once, not on every reload', page.locator('.banner').count() == 0)
        ctx.close()

        # ---------- 11. Corrupted storage: valid JSON, invalid structure
        # (name, payload, expect_notice). A stored JSON null is treated as "no data".
        bad_cases = [
            ('wrong-phase', {'version': 1, 'chapterId': 'chapter-1', 'lessonId': 'lesson-1', 'phase': 'hacked', 'questionIndex': 0, 'answers': {}}, True),
            ('forged-index', {'version': 1, 'chapterId': 'chapter-1', 'lessonId': 'lesson-1', 'phase': 'question', 'questionIndex': 50, 'answers': {}}, True),
            ('out-of-range-answer', {'version': 1, 'chapterId': 'chapter-1', 'lessonId': 'lesson-1', 'phase': 'question', 'questionIndex': 0, 'answers': {'q1': {'selectedIndex': 9, 'correct': True}}}, True),
            ('wrong-version', {'version': 42, 'chapterId': 'chapter-1', 'lessonId': 'lesson-1', 'phase': 'lesson', 'questionIndex': 0, 'answers': {}}, True),
            ('array-payload', [1, 2, 3], True),
            ('empty-string', '', True),
            ('json-null', None, False),
        ]
        for name, payload, expect_notice in bad_cases:
            ctx, page = new_page()
            page.goto(base)
            raw = payload if isinstance(payload, str) else json.dumps(payload)
            page.evaluate("([k, v]) => localStorage.setItem(k, v)", [STORAGE_KEY, raw])
            page.reload()
            has_notice = page.locator('.banner').count() == 1
            check(f'corrupt storage "{name}" renders chapter screen', '۰ از ۳' in app_text(page), app_text(page)[:120])
            check(f'corrupt storage "{name}" notice expected={expect_notice}', has_notice == expect_notice)
            ctx.close()

        # ---------- 12. Storage unavailable: app still works in memory
        block_storage = """
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get() { throw new DOMException('denied', 'SecurityError'); }
        });
        """
        ctx, page = new_page(init_script=block_storage)
        page.goto(base)
        expect(page.locator('#title')).to_have_text('کیهان، زادگاه عناصر')
        check('app loads when localStorage is blocked', page.locator('#title').inner_text() == 'کیهان، زادگاه عناصر')
        check('blocked storage shows an honest persistence notice', 'ذخیرهٔ دائمی' in app_text(page), app_text(page)[:160])
        page.get_by_role('button', name='شروع درس').click()
        page.get_by_role('button', name='شروع تمرین').click()
        page.locator('button.choice').nth(1).click()
        check('quiz still works in memory when storage is blocked', 'درست است' in app_text(page))
        ctx.close()

        # ---------- 13. Responsive layout and overflow (mobile and desktop)
        for label, vp in [('mobile-360', (360, 740)), ('desktop-1280', (1280, 800))]:
            ctx, page = new_page(viewport=vp)
            page.goto(base)
            page.get_by_role('button', name='شروع درس').click()
            page.get_by_role('button', name='شروع تمرین').click()
            overflow = page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
            check(f'no horizontal overflow at {label}', overflow <= 0, f'overflow={overflow}px')
            page.screenshot(path=os.path.join(SHOTS, f'05_question_{label}.png'), full_page=True)
            ctx.close()

        # ---------- 14. No uncaught errors across the whole run
        external = sorted(h for h in REQUEST_HOSTS if h not in ('127.0.0.1', None))
        check('no request leaves localhost (no internet dependency)', not external, str(external))
        check('no uncaught page errors or console errors', not console_errors, '; '.join(console_errors[:5]))
        browser.close()


if __name__ == '__main__':
    main()
