CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"mentions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"anchor_from" integer,
	"anchor_to" integer,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_doc_id_documents_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_doc_idx" ON "comments" USING btree ("doc_id");--> statement-breakpoint
CREATE INDEX "comments_thread_idx" ON "comments" USING btree ("thread_id");