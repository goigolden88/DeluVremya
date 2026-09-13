import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './ui/Layout.tsx'
import { Today } from './screens/Today.tsx'
import { Settings } from './screens/Settings.tsx'

/**
 * Роутинг через хеш: на GitHub Pages обычные пути дают 404 при обновлении
 * страницы — сервер ищет файл, которого нет. Всё после # до сервера не доходит.
 *
 * Синхронизация здесь не запускается до Этапа 2: код ядра уже на месте,
 * а подключение и настройки — там (Р-15).
 */
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Today />} />
          <Route path="settings" element={<Settings />} />
          {/* Незнакомый адрес — на главный. Так и ярлык на экран, которого
              ещё нет, открывает приложение, а не пустоту. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
