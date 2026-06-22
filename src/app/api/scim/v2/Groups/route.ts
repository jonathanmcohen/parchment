import { NextResponse } from 'next/server'

// v0.2 intent: SCIM 2.0 Groups endpoint — create/list/update/delete groups via
// an identity provider for automated group/team provisioning and entitlements
// under the single workspace. Until then every method returns a SCIM-shaped 501.

const scimNotImplemented = () =>
  NextResponse.json(
    {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '501',
      detail: 'SCIM is planned for v0.2',
    },
    { status: 501 },
  )

export const GET = scimNotImplemented
export const POST = scimNotImplemented
