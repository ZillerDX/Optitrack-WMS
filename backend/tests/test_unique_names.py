"""Location / category names are unique per owner, enforced by the database."""

import pytest
from httpx import AsyncClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.location import Location
from app.models.user import User

pytestmark = pytest.mark.asyncio


async def test_db_rejects_duplicate_location_per_owner(db_session: AsyncSession, admin_user: User):
    db_session.add(Location(owner_id=admin_user.id, name="Dock", capacity=10))
    await db_session.commit()
    db_session.add(Location(owner_id=admin_user.id, name="Dock", capacity=20))
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


async def test_db_rejects_duplicate_category_per_owner(db_session: AsyncSession, admin_user: User):
    db_session.add(Category(owner_id=admin_user.id, name="Tools"))
    await db_session.commit()
    db_session.add(Category(owner_id=admin_user.id, name="Tools"))
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


async def test_different_owners_may_share_a_name(db_session: AsyncSession, admin_user: User):
    other = User(email="other@test.com", password_hash="x", first_name="O", last_name="T")
    db_session.add(other)
    await db_session.commit()
    db_session.add_all([
        Location(owner_id=admin_user.id, name="Shared", capacity=1),
        Location(owner_id=other.id, name="Shared", capacity=1),
        Category(owner_id=admin_user.id, name="Shared"),
        Category(owner_id=other.id, name="Shared"),
    ])
    await db_session.commit()


async def test_api_treats_whitespace_variants_as_the_same_name(client: AsyncClient, admin_token: str):
    headers = {"Authorization": f"Bearer {admin_token}"}
    ok = await client.post("/api/locations/", json={"name": "Zone Q", "capacity": 5}, headers=headers)
    assert ok.status_code == 201
    dup = await client.post("/api/locations/", json={"name": "  Zone Q  ", "capacity": 5}, headers=headers)
    assert dup.status_code == 400

    ok = await client.post("/api/categories/", json={"name": "Gadgets"}, headers=headers)
    assert ok.status_code == 201
    dup = await client.post("/api/categories/", json={"name": " Gadgets "}, headers=headers)
    assert dup.status_code == 400


async def test_rename_to_existing_name_is_rejected(client: AsyncClient, admin_token: str):
    headers = {"Authorization": f"Bearer {admin_token}"}
    await client.post("/api/locations/", json={"name": "L1", "capacity": 5}, headers=headers)
    second = await client.post("/api/locations/", json={"name": "L2", "capacity": 5}, headers=headers)
    resp = await client.put(f"/api/locations/{second.json()['id']}", json={"name": "L1 "}, headers=headers)
    assert resp.status_code == 400
