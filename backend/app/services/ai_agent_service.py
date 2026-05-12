import json
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, desc, case
from groq import AsyncGroq, GroqError

from app.core.config import settings
from app.models.product import Product
from app.models.inventory import Inventory
from app.models.transaction import Transaction, TransactionType

logger = logging.getLogger(__name__)


class AIAgentService:
    def __init__(self):
        self._client: Optional[AsyncGroq] = None
        self.model = settings.GROQ_MODEL

    def _get_client(self) -> AsyncGroq:
        if self._client is None:
            self._client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        return self._client

    async def get_inventory_summary(self, db: AsyncSession, user_id: int) -> str:
        """Get complete inventory overview with statistics."""
        try:
            stmt = (
                select(
                    Product.sku,
                    Product.name,
                    Product.category,
                    Inventory.quantity,
                    Inventory.location,
                    Inventory.status,
                    Product.sell_price,
                    Product.cost_price,
                    Product.min_stock_level,
                    Product.unit
                )
                .select_from(Product)
                .join(Inventory, Product.id == Inventory.product_id)
                .where(Product.owner_id == user_id)
                .order_by(Product.category, Product.name)
            )
            result = await db.execute(stmt)
            items = result.all()

            if not items:
                return json.dumps({"message": "No inventory found.", "total_items": 0})

            summary = []
            total_value = 0
            total_cost = 0
            total_units = 0
            categories = {}

            for item in items:
                value = float(item.sell_price) * item.quantity
                cost = float(item.cost_price) * item.quantity
                total_value += value
                total_cost += cost
                total_units += item.quantity

                cat = item.category or "Uncategorized"
                categories[cat] = categories.get(cat, 0) + item.quantity

                summary.append({
                    "sku": item.sku,
                    "name": item.name,
                    "category": cat,
                    "quantity": item.quantity,
                    "unit": item.unit,
                    "location": item.location,
                    "status": str(item.status.value) if item.status else "UNKNOWN",
                    "sell_price": float(item.sell_price),
                    "cost_price": float(item.cost_price),
                    "min_stock": item.min_stock_level,
                    "stock_value": round(value, 2)
                })

            return json.dumps({
                "items": summary,
                "statistics": {
                    "total_items": len(summary),
                    "total_units": total_units,
                    "total_value": round(total_value, 2),
                    "total_cost": round(total_cost, 2),
                    "potential_profit": round(total_value - total_cost, 2),
                    "categories": categories
                }
            })
        except Exception as e:
            logger.error(f"Database error in get_inventory_summary: {e}")
            return json.dumps({"error": str(e)})

    async def get_low_stock_items(self, db: AsyncSession, user_id: int) -> str:
        """Find items below minimum stock level with reorder suggestions."""
        try:
            stmt = (
                select(
                    Product.sku,
                    Product.name,
                    Product.category,
                    Inventory.quantity,
                    Inventory.location,
                    Product.min_stock_level,
                    Product.cost_price,
                    Product.supplier
                )
                .select_from(Product)
                .join(Inventory, Product.id == Inventory.product_id)
                .where(and_(
                    Product.owner_id == user_id,
                    Inventory.quantity < Product.min_stock_level
                ))
                .order_by(Inventory.quantity)
            )
            result = await db.execute(stmt)
            items = result.all()

            if not items:
                return json.dumps({"message": "All items are sufficiently stocked.", "low_stock_count": 0})

            low_stock = []
            total_reorder_cost = 0

            for i in items:
                reorder_qty = i.min_stock_level - i.quantity + 10  # Suggest ordering above minimum
                reorder_cost = reorder_qty * float(i.cost_price)
                total_reorder_cost += reorder_cost

                urgency = "CRITICAL" if i.quantity == 0 else "HIGH" if i.quantity < i.min_stock_level / 2 else "MEDIUM"

                low_stock.append({
                    "sku": i.sku,
                    "name": i.name,
                    "category": i.category,
                    "current_quantity": i.quantity,
                    "min_required": i.min_stock_level,
                    "shortage": i.min_stock_level - i.quantity,
                    "location": i.location,
                    "supplier": i.supplier or "Not specified",
                    "urgency": urgency,
                    "suggested_reorder_qty": reorder_qty,
                    "estimated_reorder_cost": round(reorder_cost, 2)
                })

            return json.dumps({
                "low_stock_items": low_stock,
                "summary": {
                    "total_low_stock": len(low_stock),
                    "critical_count": sum(1 for x in low_stock if x["urgency"] == "CRITICAL"),
                    "total_reorder_cost": round(total_reorder_cost, 2)
                }
            })
        except Exception as e:
            logger.error(f"Database error in get_low_stock_items: {e}")
            return json.dumps({"error": str(e)})

    async def get_recent_transactions(self, db: AsyncSession, user_id: int, limit: int = 15, transaction_type: str = None) -> str:
        """Get recent transactions with filtering options."""
        try:
            stmt = (
                select(
                    Transaction.id,
                    Transaction.ref_code,
                    Transaction.type,
                    Transaction.quantity,
                    Transaction.unit_price,
                    Transaction.total_price,
                    Transaction.location,
                    Transaction.notes,
                    Transaction.created_at,
                    Product.name,
                    Product.sku,
                    Product.category
                )
                .select_from(Transaction)
                .join(Product, Transaction.product_id == Product.id)
                .where(Transaction.user_id == user_id)
                .order_by(desc(Transaction.created_at))
                .limit(min(limit, 50))
            )

            if transaction_type and transaction_type.upper() in ["INBOUND", "OUTBOUND", "ADJUST"]:
                stmt = stmt.where(Transaction.type == transaction_type.upper())

            result = await db.execute(stmt)
            rows = result.all()

            if not rows:
                return json.dumps({"message": "No transactions found.", "transactions": []})

            txs = []
            total_inbound = 0
            total_outbound = 0

            for tx in rows:
                tx_type = str(tx.type.value) if hasattr(tx.type, 'value') else str(tx.type)

                if "INBOUND" in tx_type:
                    total_inbound += float(tx.total_price)
                elif "OUTBOUND" in tx_type:
                    total_outbound += float(tx.total_price)

                txs.append({
                    "id": tx.id,
                    "ref_code": tx.ref_code,
                    "type": tx_type,
                    "product_name": tx.name,
                    "product_sku": tx.sku,
                    "category": tx.category,
                    "quantity": tx.quantity,
                    "unit_price": float(tx.unit_price),
                    "total_price": float(tx.total_price),
                    "location": tx.location,
                    "notes": tx.notes,
                    "date": tx.created_at.strftime("%Y-%m-%d %H:%M")
                })

            return json.dumps({
                "transactions": txs,
                "summary": {
                    "count": len(txs),
                    "total_inbound_value": round(total_inbound, 2),
                    "total_outbound_value": round(total_outbound, 2),
                    "net_flow": round(total_inbound - total_outbound, 2)
                }
            })
        except Exception as e:
            logger.error(f"Database error in get_recent_transactions: {e}")
            return json.dumps({"error": str(e)})

    async def get_warehouse_value(self, db: AsyncSession, user_id: int) -> str:
        """Calculate comprehensive warehouse financial metrics."""
        try:
            stmt = (
                select(
                    func.sum(Inventory.quantity * Product.cost_price).label("total_cost"),
                    func.sum(Inventory.quantity * Product.sell_price).label("total_value"),
                    func.sum(Inventory.quantity).label("total_units"),
                    func.count(Product.id.distinct()).label("product_count")
                )
                .select_from(Product)
                .join(Inventory, Product.id == Inventory.product_id)
                .where(Product.owner_id == user_id)
            )
            result = await db.execute(stmt)
            row = result.one_or_none()

            if not row or row.total_cost is None:
                return json.dumps({"message": "Warehouse is empty.", "total_value": 0})

            total_cost = float(row.total_cost)
            total_value = float(row.total_value)
            profit_margin = ((total_value - total_cost) / total_cost * 100) if total_cost > 0 else 0

            return json.dumps({
                "total_cost_basis": round(total_cost, 2),
                "total_market_value": round(total_value, 2),
                "potential_profit": round(total_value - total_cost, 2),
                "profit_margin_percent": round(profit_margin, 1),
                "total_units": int(row.total_units),
                "unique_products": int(row.product_count)
            })
        except Exception as e:
            logger.error(f"Database error in get_warehouse_value: {e}")
            return json.dumps({"error": str(e)})

    async def search_products(self, db: AsyncSession, user_id: int, query: str) -> str:
        """Search products by name, SKU, or category."""
        try:
            search_term = f"%{query.lower()}%"
            stmt = (
                select(
                    Product.sku,
                    Product.name,
                    Product.category,
                    Product.supplier,
                    Product.cost_price,
                    Product.sell_price,
                    Inventory.quantity,
                    Inventory.location,
                    Inventory.status
                )
                .select_from(Product)
                .outerjoin(Inventory, Product.id == Inventory.product_id)
                .where(and_(
                    Product.owner_id == user_id,
                    or_(
                        func.lower(Product.name).like(search_term),
                        func.lower(Product.sku).like(search_term),
                        func.lower(Product.category).like(search_term),
                        func.lower(Product.supplier).like(search_term)
                    )
                ))
                .limit(20)
            )
            result = await db.execute(stmt)
            items = result.all()

            if not items:
                return json.dumps({"message": f"No products found matching '{query}'.", "results": []})

            products = []
            for item in items:
                products.append({
                    "sku": item.sku,
                    "name": item.name,
                    "category": item.category,
                    "supplier": item.supplier,
                    "cost_price": float(item.cost_price),
                    "sell_price": float(item.sell_price),
                    "profit_per_unit": round(float(item.sell_price) - float(item.cost_price), 2),
                    "quantity": item.quantity or 0,
                    "location": item.location or "Not in inventory",
                    "status": str(item.status.value) if item.status else "N/A"
                })

            return json.dumps({
                "query": query,
                "results": products,
                "count": len(products)
            })
        except Exception as e:
            logger.error(f"Database error in search_products: {e}")
            return json.dumps({"error": str(e)})

    async def get_sales_analytics(self, db: AsyncSession, user_id: int, days: int = 30) -> str:
        """Get sales analytics and top performing products."""
        try:
            start_date = datetime.now(timezone.utc) - timedelta(days=days)

            top_products_stmt = (
                select(
                    Product.name,
                    Product.sku,
                    Product.category,
                    func.sum(Transaction.quantity).label("total_sold"),
                    func.sum(Transaction.total_price).label("total_revenue"),
                    func.sum(Transaction.quantity * Product.cost_price).label("total_cost")
                )
                .select_from(Transaction)
                .join(Product, Transaction.product_id == Product.id)
                .where(and_(
                    Transaction.user_id == user_id,
                    Transaction.type == TransactionType.OUTBOUND,
                    Transaction.created_at >= start_date
                ))
                .group_by(Product.id, Product.name, Product.sku, Product.category)
                .order_by(desc(func.sum(Transaction.total_price)))
                .limit(10)
            )
            top_result = await db.execute(top_products_stmt)
            top_products = top_result.all()

            stats_stmt = (
                select(
                    func.count(Transaction.id).label("transaction_count"),
                    func.sum(case((Transaction.type == TransactionType.OUTBOUND, Transaction.total_price), else_=0)).label("total_sales"),
                    func.sum(case((Transaction.type == TransactionType.INBOUND, Transaction.total_price), else_=0)).label("total_purchases"),
                    func.sum(case((Transaction.type == TransactionType.OUTBOUND, Transaction.quantity), else_=0)).label("units_sold"),
                    func.sum(case((Transaction.type == TransactionType.OUTBOUND, Transaction.quantity * Product.cost_price), else_=0)).label("cogs")
                )
                .select_from(Transaction)
                .join(Product, Transaction.product_id == Product.id)
                .where(and_(
                    Transaction.user_id == user_id,
                    Transaction.created_at >= start_date
                ))
            )
            stats_result = await db.execute(stats_stmt)
            stats = stats_result.one()

            top_list = []
            for p in top_products:
                revenue = float(p.total_revenue) if p.total_revenue else 0
                cost = float(p.total_cost) if p.total_cost else 0
                profit = revenue - cost
                top_list.append({
                    "name": p.name,
                    "sku": p.sku,
                    "category": p.category,
                    "units_sold": int(p.total_sold),
                    "revenue": round(revenue, 2),
                    "profit": round(profit, 2),
                    "profit_margin": round((profit / revenue * 100) if revenue > 0 else 0, 1)
                })

            total_sales = float(stats.total_sales) if stats.total_sales else 0
            total_purchases = float(stats.total_purchases) if stats.total_purchases else 0
            total_cogs = float(stats.cogs) if stats.cogs else 0

            return json.dumps({
                "period_days": days,
                "top_selling_products": top_list,
                "overall_stats": {
                    "total_transactions": int(stats.transaction_count) if stats.transaction_count else 0,
                    "total_sales_revenue": round(total_sales, 2),
                    "total_purchase_cost": round(total_purchases, 2),
                    "cost_of_goods_sold": round(total_cogs, 2),
                    "units_sold": int(stats.units_sold) if stats.units_sold else 0,
                    "gross_profit": round(total_sales - total_cogs, 2),
                    "profit_margin_percent": round(((total_sales - total_cogs) / total_sales * 100) if total_sales > 0 else 0, 1),
                    "avg_daily_sales": round(total_sales / days, 2) if days > 0 else 0
                }
            })
        except Exception as e:
            logger.error(f"Database error in get_sales_analytics: {e}")
            return json.dumps({"error": str(e)})

    async def get_category_breakdown(self, db: AsyncSession, user_id: int) -> str:
        """Get inventory breakdown by category."""
        try:
            stmt = (
                select(
                    Product.category,
                    func.count(Product.id.distinct()).label("product_count"),
                    func.sum(Inventory.quantity).label("total_units"),
                    func.sum(Inventory.quantity * Product.cost_price).label("total_cost"),
                    func.sum(Inventory.quantity * Product.sell_price).label("total_value")
                )
                .select_from(Product)
                .join(Inventory, Product.id == Inventory.product_id)
                .where(Product.owner_id == user_id)
                .group_by(Product.category)
                .order_by(desc(func.sum(Inventory.quantity * Product.sell_price)))
            )
            result = await db.execute(stmt)
            categories = result.all()

            if not categories:
                return json.dumps({"message": "No categories found.", "categories": []})

            cat_list = []
            total_value = sum(float(c.total_value) for c in categories if c.total_value)

            for c in categories:
                value = float(c.total_value) if c.total_value else 0
                cost = float(c.total_cost) if c.total_cost else 0
                cat_list.append({
                    "category": c.category or "Uncategorized",
                    "product_count": int(c.product_count),
                    "total_units": int(c.total_units) if c.total_units else 0,
                    "total_value": round(value, 2),
                    "total_cost": round(cost, 2),
                    "potential_profit": round(value - cost, 2),
                    "percentage_of_inventory": round((value / total_value * 100) if total_value > 0 else 0, 1)
                })

            return json.dumps({
                "categories": cat_list,
                "total_categories": len(cat_list),
                "total_inventory_value": round(total_value, 2)
            })
        except Exception as e:
            logger.error(f"Database error in get_category_breakdown: {e}")
            return json.dumps({"error": str(e)})

    async def get_location_stock(self, db: AsyncSession, user_id: int, location: str = None) -> str:
        """Get stock levels by location."""
        try:
            stmt = (
                select(
                    Inventory.location,
                    func.count(Inventory.id).label("item_count"),
                    func.sum(Inventory.quantity).label("total_units"),
                    func.sum(Inventory.quantity * Product.sell_price).label("total_value")
                )
                .select_from(Inventory)
                .join(Product, Inventory.product_id == Product.id)
                .where(Product.owner_id == user_id)
                .group_by(Inventory.location)
                .order_by(desc(func.sum(Inventory.quantity)))
            )

            if location:
                stmt = stmt.where(func.lower(Inventory.location).like(f"%{location.lower()}%"))

            result = await db.execute(stmt)
            locations = result.all()

            if not locations:
                return json.dumps({"message": "No location data found.", "locations": []})

            loc_list = []
            for loc in locations:
                loc_list.append({
                    "location": loc.location,
                    "item_count": int(loc.item_count),
                    "total_units": int(loc.total_units) if loc.total_units else 0,
                    "total_value": round(float(loc.total_value), 2) if loc.total_value else 0
                })

            return json.dumps({
                "locations": loc_list,
                "total_locations": len(loc_list)
            })
        except Exception as e:
            logger.error(f"Database error in get_location_stock: {e}")
            return json.dumps({"error": str(e)})

    def get_tools_definition(self):
        return [
            {
                "type": "function",
                "function": {
                    "name": "get_inventory_summary",
                    "description": "Get a comprehensive overview of all inventory including quantities, values, locations, and category breakdown. Use this for general inventory questions.",
                    "parameters": {"type": "object", "properties": {}, "required": []}
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_low_stock_items",
                    "description": "Find products that are below their minimum stock level and need reordering. Returns urgency levels and reorder suggestions.",
                    "parameters": {"type": "object", "properties": {}, "required": []}
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_recent_transactions",
                    "description": "View recent stock movements including inbound (purchases), outbound (sales), and adjustments. Can filter by transaction type.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "limit": {"type": "integer", "description": "Number of transactions to fetch (default 15, max 50)"},
                            "transaction_type": {"type": "string", "enum": ["INBOUND", "OUTBOUND", "ADJUST"], "description": "Filter by transaction type"}
                        },
                        "required": []
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_warehouse_value",
                    "description": "Calculate total warehouse value, cost basis, potential profit, and profit margins.",
                    "parameters": {"type": "object", "properties": {}, "required": []}
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "search_products",
                    "description": "Search for specific products by name, SKU, category, or supplier. Use this when user asks about a specific product.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "Search term (product name, SKU, category, or supplier)"}
                        },
                        "required": ["query"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_sales_analytics",
                    "description": "Get sales performance data including top selling products, revenue, and profit analysis over a time period.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "days": {"type": "integer", "description": "Number of days to analyze (default 30)"}
                        },
                        "required": []
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_category_breakdown",
                    "description": "Get inventory statistics broken down by product category including value and profit potential.",
                    "parameters": {"type": "object", "properties": {}, "required": []}
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_location_stock",
                    "description": "Get stock levels and values organized by warehouse location.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "location": {"type": "string", "description": "Optional location name to filter by"}
                        },
                        "required": []
                    }
                }
            }
        ]

    async def chat(self, db: AsyncSession, user_id: int, message: str, history: List[Dict[str, str]] = None) -> str:
        """Core Agent Loop using Groq Tool Calling."""

        system_prompt = """You are OptiTrack AI, an expert warehouse management assistant with real-time access to inventory data.

CAPABILITIES:
- View complete inventory with quantities, locations, and values
- Identify low stock items that need reordering
- Analyze sales performance and top-selling products
- Search for specific products by name, SKU, or category
- Calculate warehouse value and profit margins
- Break down inventory by category or location
- Review recent transactions (purchases and sales)

RESPONSE GUIDELINES:
1. ALWAYS use tools to get current data - never guess or make up numbers
2. Present data in a clear, organized format using bullet points or tables when appropriate
3. Provide actionable insights, not just raw numbers
4. For financial data, always show currency values clearly
5. When showing multiple items, organize them logically (by urgency, value, or relevance)
6. Be concise but thorough - include relevant context
7. If asked about trends, compare with available historical data
8. Suggest next steps or actions when appropriate

FORMATTING:
- Use clean Markdown tables to display lists of products, inventory, or transactions for clear alignment and readability.
- Do not overuse asterisks (**bold**). Only use bold sparingly for overall totals or important column headers.
- Avoid cluttered inline bullet points with many attributes (e.g. do not write "• **Item** - price: **$10**"); use a table instead.
- Keep responses clean, focused, and highly scannable.
- Round currency to 2 decimal places.
- Use percentages for comparisons.

NEVER:
- Mention tool names or internal processes
- Show raw JSON data
- Say "I'll query the database" or similar
- Make up data if tools return errors - explain the issue instead"""

        messages = [{"role": "system", "content": system_prompt}]
        if history:
            messages.extend(history[-10:])
        messages.append({"role": "user", "content": message})

        tools = self.get_tools_definition()

        if not settings.GROQ_API_KEY:
            return "AI chat is not configured. Please set GROQ_API_KEY and restart the service."

        try:
            client = self._get_client()
            response = await client.chat.completions.create(
                model=self.model,
                messages=messages,
                tools=tools,
                tool_choice="auto",
                max_tokens=1500,
                temperature=0.3
            )

            response_message = response.choices[0].message
            tool_calls = response_message.tool_calls

            if tool_calls:
                messages.append(response_message)

                for tool_call in tool_calls:
                    function_name = tool_call.function.name
                    function_args = json.loads(tool_call.function.arguments or "{}")

                    logger.info(f"AI calling tool: {function_name} with {function_args}")

                    content = await self._execute_tool(db, user_id, function_name, function_args)

                    messages.append({
                        "tool_call_id": tool_call.id,
                        "role": "tool",
                        "name": function_name,
                        "content": content,
                    })

                final_response = await client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    max_tokens=1500,
                    temperature=0.3
                )
                return final_response.choices[0].message.content

            return response_message.content

        except GroqError as ge:
            logger.error(f"Groq API Error: {ge}")
            return "I'm experiencing a temporary issue connecting to my data services. Please try again in a moment."
        except Exception as e:
            logger.error(f"Error in AI Chat loop: {e}")
            return "I encountered an unexpected error. Please try rephrasing your question."

    async def _execute_tool(self, db: AsyncSession, user_id: int, function_name: str, args: dict) -> str:
        """Execute a tool function by name."""
        tool_map = {
            "get_inventory_summary": lambda: self.get_inventory_summary(db, user_id),
            "get_low_stock_items": lambda: self.get_low_stock_items(db, user_id),
            "get_recent_transactions": lambda: self.get_recent_transactions(
                db, user_id,
                args.get("limit", 15),
                args.get("transaction_type")
            ),
            "get_warehouse_value": lambda: self.get_warehouse_value(db, user_id),
            "search_products": lambda: self.search_products(db, user_id, args.get("query", "")),
            "get_sales_analytics": lambda: self.get_sales_analytics(db, user_id, args.get("days", 30)),
            "get_category_breakdown": lambda: self.get_category_breakdown(db, user_id),
            "get_location_stock": lambda: self.get_location_stock(db, user_id, args.get("location")),
        }

        if function_name in tool_map:
            return await tool_map[function_name]()
        return json.dumps({"error": f"Unknown tool: {function_name}"})


ai_agent_service = AIAgentService()
