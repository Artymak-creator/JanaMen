-- JanaМен: назначение ролей, руководителей и остатка отпуска.
-- ВЫПОЛНЯТЬ ПОСЛЕ 00_FRESH_DATABASE.sql и после регистрации всех тестовых пользователей.
-- Замените email-адреса на настоящие. Выполняется в Supabase → SQL Editor (под владельцем проекта).

-- 0) Кто зарегистрирован (проверьте, что нужные аккаунты есть):
SELECT u.email, p.role, p.manager_id, p.annual_leave_days_remaining
FROM auth.users u LEFT JOIN public.profiles p ON p.user_id = u.id
ORDER BY u.email;

-- 1) HR
UPDATE public.profiles SET role = 'hr'
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'hr@example.com');

-- 2) Руководитель
UPDATE public.profiles SET role = 'manager'
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'manager@example.com');

-- 3) Сотрудник: назначьте руководителя. Остаток заполните отдельно по подтверждённым данным HR.
UPDATE public.profiles SET
  manager_id = (SELECT id FROM auth.users WHERE email = 'manager@example.com')
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'employee@example.com');

-- 4) ОСТАТОК ДНЕЙ: раскомментируйте и замените 0 на подтверждённое число дней из HR.
-- UPDATE public.profiles SET annual_leave_days_remaining = 0
-- WHERE user_id = (SELECT id FROM auth.users WHERE email = 'employee@example.com');

-- 5) (необязательно) Руководителю можно указать вышестоящего руководителя.
--    Без manager_id собственная заявка руководителя направляется сразу в HR.
-- При необходимости задайте руководителю отдельный подтверждённый остаток дней.

-- 6) Итоговая проверка
SELECT u.email, p.role, m.email AS manager_email, p.annual_leave_days_remaining
FROM public.profiles p
JOIN auth.users u ON u.id = p.user_id
LEFT JOIN auth.users m ON m.id = p.manager_id
ORDER BY p.role, u.email;
