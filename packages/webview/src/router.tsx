import {
  createMemoryRouter,
  IndexRouteObject,
  NonIndexRouteObject,
  Navigate,
} from 'react-router-dom'
import { NovelerRouter } from 'common/types'
import AIChat from '@app/components/AIChat'
import React from 'react'

interface NovelerIndexRouteObject extends IndexRouteObject {
  path: NovelerRouter
}

interface NovelerNonIndexRouteObject extends NonIndexRouteObject {
  path: NovelerRouter
}

type NovelerRouteObject = NovelerIndexRouteObject | NovelerNonIndexRouteObject

const routes: NovelerRouteObject[] = [
  {
    path: '/',
    element: <Navigate to='/ai-chat' />,
    id: 'home',
  },
  {
    path: '/ai-chat',
    element: <AIChat />,
    id: 'ai-chat',
  },
]

export default createMemoryRouter(routes)
