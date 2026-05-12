"""Dashboard analytics routes."""

from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.schemas import DashboardStats, SalesVsCostData, StorageHealthMetrics
from app.models.product import Product
from app.models.inventory import Inventory, InventoryStatus
from app.models.transaction import Transaction, TransactionType
from app.models.user import User
from app.models.location import Location

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    location: Optional[str] = Query(None, description="Filter by warehouse location"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return high-level dashboard metrics for the current user."""
    if location:
        product_count_query = (
            select(func.count(Product.id.distinct()))
            .join(Inventory, Product.id == Inventory.product_id)
            .where(Product.owner_id == current_user.id, Inventory.location == location)
        )
    else:
        product_count_query = (
            select(func.count(Product.id)).where(Product.owner_id == current_user.id)
        )
    result = await db.execute(product_count_query)
    total_products = result.scalar() or 0

    inventory_value_query = (
        select(func.sum(Inventory.quantity * Product.cost_price))
        .join(Product, Inventory.product_id == Product.id)
        .where(Product.owner_id == current_user.id)
    )
    if location:
        inventory_value_query = inventory_value_query.where(Inventory.location == location)

    result = await db.execute(inventory_value_query)
    total_inventory_value = result.scalar() or 0

    low_stock_query = (
        select(func.count(Inventory.id))
        .join(Product)
        .where(
            Inventory.status == InventoryStatus.LOW_STOCK,
            Product.owner_id == current_user.id
        )
    )
    if location:
        low_stock_query = low_stock_query.where(Inventory.location == location)

    result = await db.execute(low_stock_query)
    low_stock_count = result.scalar() or 0

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    tx_query = (
        select(func.count(Transaction.id)).where(
            Transaction.created_at >= today_start,
            Transaction.user_id == current_user.id
        )
    )
    if location:
        tx_query = tx_query.where(Transaction.location == location)

    result = await db.execute(tx_query)
    total_transactions_today = result.scalar() or 0

    return DashboardStats(
        total_products=total_products,
        total_inventory_value=total_inventory_value,
        low_stock_count=low_stock_count,
        total_transactions_today=total_transactions_today
    )


@router.get("/sales-chart", response_model=List[SalesVsCostData])
async def get_sales_chart(
    days: int = 7,
    location: Optional[str] = Query(None, description="Filter by warehouse location"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return sales, cost, and profit trends for the selected period."""
    start_date = datetime.now(timezone.utc) - timedelta(days=days)

    query = select(
        func.date(Transaction.created_at).label('date'),
        func.sum(Transaction.total_price).label('sales'),
        func.sum(Transaction.quantity * Product.cost_price).label('cost')
    ).join(Product, Transaction.product_id == Product.id)\
    .where(
        Transaction.created_at >= start_date,
        Transaction.type == TransactionType.OUTBOUND,
        Transaction.user_id == current_user.id
    )

    if location:
        query = query.where(Transaction.location == location)

    query = query.group_by(func.date(Transaction.created_at))\
    .order_by(func.date(Transaction.created_at))

    result = await db.execute(query)
    rows = result.all()

    data = []
    for row in rows:
        sales = row.sales or 0
        cost = row.cost or 0
        data.append(SalesVsCostData(
            date=str(row.date),
            sales=sales,
            cost=cost,
            profit=sales - cost
        ))

    return data


@router.get("/metrics", response_model=StorageHealthMetrics)
async def get_storage_health_metrics(
    location: Optional[str] = Query(None, description="Filter by warehouse location"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return warehouse capacity usage metrics."""
    inv_qty_query = (
        select(func.coalesce(func.sum(Inventory.quantity), 0))
        .join(Product, Inventory.product_id == Product.id)
        .where(Product.owner_id == current_user.id)
    )
    cap_query = (
        select(func.coalesce(func.sum(Location.capacity), 0))
        .where(Location.owner_id == current_user.id)
    )
    if location:
        inv_qty_query = inv_qty_query.where(Inventory.location == location)
        cap_query = cap_query.where(Location.name == location)

    total_qty = (await db.execute(inv_qty_query)).scalar() or 0
    total_cap = (await db.execute(cap_query)).scalar() or 0

    if total_cap > 0:
        capacity_pct = min(round((total_qty / total_cap) * 100, 1), 100.0)
    else:
        capacity_pct = 0.0
    capacity_label = f"{capacity_pct}% Used"

    return StorageHealthMetrics(
        warehouse_capacity_pct=capacity_pct,
        warehouse_capacity_label=capacity_label
    )
