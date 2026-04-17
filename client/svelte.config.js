import adapterStatic from '@sveltejs/adapter-static'

/** @type {import('@sveltejs/kit').Config} */
export default {
    kit: {
        adapter: adapterStatic({
            pages: 'build',
            assets: 'build',
            fallback: 'index.html',
            precompress: false,
            strict: false,
        }),
        files: {
            assets: 'public',
        },
        prerender: {
            crawl: true,
            entries: ['*'],
            handleHttpError: 'warn',
        },
    },
}
