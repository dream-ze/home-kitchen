import { NavLink } from 'react-router-dom';
import { Icon } from './Icon';

const TABS = [
  { to: '/', icon: 'today', label: '今天' },
  { to: '/recipes', icon: 'book', label: '菜谱' },
  { to: '/shopping', icon: 'cart', label: '购物' },
  { to: '/fridge', icon: 'fridge', label: '冰箱' },
];

export function TabBar({ active }: { active?: string }) {
  return (
    <nav className="tabbar" aria-label="主导航">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.to === '/'}
          className={({ isActive }) => (isActive || active === t.to ? 'active' : '')}
        >
          <Icon name={t.icon} size={24} />
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
