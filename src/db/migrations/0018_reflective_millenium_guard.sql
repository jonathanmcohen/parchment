CREATE TABLE "cairn_links" (
	"source_doc_id" uuid NOT NULL,
	"page_id" text NOT NULL,
	CONSTRAINT "cairn_links_source_doc_id_page_id_pk" PRIMARY KEY("source_doc_id","page_id")
);
--> statement-breakpoint
ALTER TABLE "cairn_links" ADD CONSTRAINT "cairn_links_source_doc_id_documents_id_fk" FOREIGN KEY ("source_doc_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cairn_links_page_idx" ON "cairn_links" USING btree ("page_id");